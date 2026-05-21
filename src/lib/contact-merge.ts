import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact, Brand } from '@/types';

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits || null;
}

function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.trim().replace(/^@/, '').toLowerCase() || null;
}

/**
 * Finds an active contact by (brand, phone) OR (brand, instagram_id).
 * Returns null if no match.
 */
export async function findContact(
  supabase: SupabaseClient,
  brand: Brand,
  phone: string | null,
  instagramId: string | null
): Promise<Contact | null> {
  const normPhone = normalizePhone(phone);
  const normIG = normalizeInstagramHandle(instagramId);
  if (!normPhone && !normIG) return null;

  const filters: string[] = [];
  if (normPhone) filters.push(`phone.eq.${normPhone}`);
  if (normIG) filters.push(`instagram_id.eq.${normIG}`);

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('brand', brand)
    .eq('status', 'ACTIVE')
    .or(filters.join(','))
    .limit(1)
    .maybeSingle();

  return (data as Contact) ?? null;
}

/**
 * Find-or-create contact. If both phone and IG resolve to DIFFERENT contacts,
 * triggers a merge (smaller-id wins as target).
 */
export async function findOrCreateContact(
  supabase: SupabaseClient,
  brand: Brand,
  opts: { name?: string | null; phone?: string | null; instagramId?: string | null }
): Promise<Contact> {
  const normPhone = normalizePhone(opts.phone);
  const normIG = normalizeInstagramHandle(opts.instagramId);

  // Look up by each identifier separately so we can detect cross-channel matches
  let byPhone: Contact | null = null;
  let byIG: Contact | null = null;

  if (normPhone) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('brand', brand)
      .eq('status', 'ACTIVE')
      .eq('phone', normPhone)
      .maybeSingle();
    byPhone = (data as Contact) ?? null;
  }

  if (normIG) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('brand', brand)
      .eq('status', 'ACTIVE')
      .eq('instagram_id', normIG)
      .maybeSingle();
    byIG = (data as Contact) ?? null;
  }

  // Case A: both identifiers point to the same contact → return it
  if (byPhone && byIG && byPhone.id === byIG.id) {
    return byPhone;
  }

  // Case B: identifiers point to two different contacts → merge
  if (byPhone && byIG && byPhone.id !== byIG.id) {
    const target = byPhone.created_at <= byIG.created_at ? byPhone : byIG;
    const source = target.id === byPhone.id ? byIG : byPhone;
    return await mergeContacts(supabase, source, target);
  }

  // Case C: only one matched → enrich it with the other identifier if provided
  const existing = byPhone ?? byIG;
  if (existing) {
    const enrich: Partial<Contact> = { updated_at: new Date().toISOString() };
    if (normPhone && !existing.phone) enrich.phone = normPhone;
    if (normIG && !existing.instagram_id) enrich.instagram_id = normIG;
    if (opts.name && !existing.name) enrich.name = opts.name;
    if (Object.keys(enrich).length > 1) {
      const { data } = await supabase
        .from('contacts')
        .update(enrich)
        .eq('id', existing.id)
        .select('*')
        .single();
      return (data as Contact) ?? existing;
    }
    return existing;
  }

  // Case D: no match → create
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      brand,
      name: opts.name ?? null,
      phone: normPhone,
      instagram_id: normIG,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create contact: ${error?.message}`);
  }
  return data as Contact;
}

/**
 * Merge `source` contact into `target`. Target keeps its identifiers when
 * present; missing fields are filled from source. All conversations and
 * qualification data on source move to target. Source is marked MERGED.
 */
export async function mergeContacts(
  supabase: SupabaseClient,
  source: Contact,
  target: Contact
): Promise<Contact> {
  console.log(`[Merge] contact ${source.id} → ${target.id}`);

  // Build merged record: target wins on non-null fields, source fills gaps
  const merged: Partial<Contact> = {
    name: target.name ?? source.name,
    phone: target.phone ?? source.phone,
    instagram_id: target.instagram_id ?? source.instagram_id,
    city: target.city ?? source.city,
    wedding_date: target.wedding_date ?? source.wedding_date,
    guest_count: target.guest_count ?? source.guest_count,
    budget_range: target.budget_range ?? source.budget_range,
    service_type: target.service_type ?? source.service_type,
    updated_at: new Date().toISOString(),
  };

  // Move conversations
  await supabase
    .from('conversations')
    .update({ contact_id: target.id })
    .eq('contact_id', source.id);

  // Update target with merged data
  const { data: updated } = await supabase
    .from('contacts')
    .update(merged)
    .eq('id', target.id)
    .select('*')
    .single();

  // Mark source as merged (clear identifiers so unique indexes don't trip)
  await supabase
    .from('contacts')
    .update({
      status: 'MERGED',
      merged_into_contact_id: target.id,
      phone: null,
      instagram_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', source.id);

  return (updated as Contact) ?? target;
}

/**
 * Update contact qualification fields from AI extraction.
 * Triggers merge if new identifier (phone/IG) matches another contact.
 */
export async function updateContactFromQualification(
  supabase: SupabaseClient,
  contactId: string,
  brand: Brand,
  qual: {
    city?: string | null;
    wedding_date?: string | null;
    guest_count?: string | null;
    budget_range?: string | null;
    service_type?: string | null;
    instagram_id?: string | null;
    phone?: string | null;
    name?: string | null;
  }
): Promise<string> {
  const { data: current } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();
  const contact = current as Contact | null;
  if (!contact) return contactId;

  const normPhone = normalizePhone(qual.phone);
  const normIG = normalizeInstagramHandle(qual.instagram_id);

  // Check if the newly extracted identifier matches a different contact → merge
  let mergeTo: Contact | null = null;
  if (normPhone && normPhone !== contact.phone) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('brand', brand)
      .eq('status', 'ACTIVE')
      .eq('phone', normPhone)
      .neq('id', contactId)
      .maybeSingle();
    if (data) mergeTo = data as Contact;
  }
  if (!mergeTo && normIG && normIG !== contact.instagram_id) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('brand', brand)
      .eq('status', 'ACTIVE')
      .eq('instagram_id', normIG)
      .neq('id', contactId)
      .maybeSingle();
    if (data) mergeTo = data as Contact;
  }

  if (mergeTo) {
    // Conflict guard: if both contacts have the *other* identifier and they differ, abort merge
    const conflict =
      (contact.phone && mergeTo.phone && contact.phone !== mergeTo.phone) ||
      (contact.instagram_id && mergeTo.instagram_id && contact.instagram_id !== mergeTo.instagram_id);
    if (!conflict) {
      const target = mergeTo.created_at <= contact.created_at ? mergeTo : contact;
      const source = target.id === mergeTo.id ? contact : mergeTo;
      const merged = await mergeContacts(supabase, source, target);
      // After merge, apply qualification updates to the surviving target
      await applyQualificationUpdates(supabase, merged.id, qual);
      return merged.id;
    }
    console.warn(`[Merge] Conflict detected, skipping merge: ${contact.id} ↔ ${mergeTo.id}`);
  }

  await applyQualificationUpdates(supabase, contactId, qual);
  return contactId;
}

async function applyQualificationUpdates(
  supabase: SupabaseClient,
  contactId: string,
  qual: Record<string, string | null | undefined>
) {
  // Preserve-existing: a single LLM hallucination must not flip an
  // already-confirmed field. We only write a qualification field when
  // the contact's current value is null. Identifiers (phone/IG) follow
  // the same rule — the merge path in updateContactFromQualification
  // is what handles legitimate identifier changes.
  const { data: current } = await supabase
    .from('contacts')
    .select('city, wedding_date, guest_count, budget_range, service_type, name, phone, instagram_id')
    .eq('id', contactId)
    .maybeSingle();
  if (!current) return;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields = ['city', 'wedding_date', 'guest_count', 'budget_range', 'service_type', 'name'] as const;
  for (const f of fields) {
    if (qual[f] && !current[f]) updates[f] = qual[f];
  }
  const normPhone = normalizePhone(qual.phone);
  const normIG = normalizeInstagramHandle(qual.instagram_id);
  if (normPhone && !current.phone) updates.phone = normPhone;
  if (normIG && !current.instagram_id) updates.instagram_id = normIG;

  if (Object.keys(updates).length > 1) {
    await supabase.from('contacts').update(updates).eq('id', contactId);
  }
}
