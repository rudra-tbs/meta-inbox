export type Brand = 'TBS' | 'RD';
export type Channel = 'WA' | 'IG';
export type ConversationMode = 'AI' | 'HUMAN';
export type ConversationStatus = 'ACTIVE' | 'QUALIFIED' | 'UNQUALIFIED' | 'CLOSED';
export type ContactStatus = 'ACTIVE' | 'MERGED';
export type UserRole = 'ADMIN' | 'AGENT';

export interface AppUser {
  id: string;
  auth_id: string | null;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface UserAccess {
  id: string;
  user_id: string;
  brand: string;
  channel: string;
}

export interface Contact {
  id: string;
  brand: Brand;
  name: string | null;
  phone: string | null;
  instagram_id: string | null;
  city: string | null;
  wedding_date: string | null;
  guest_count: string | null;
  budget_range: string | null;
  service_type: string | null;
  notes: string | null;
  status: ContactStatus;
  merged_into_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReplyTemplate {
  id: string;
  brand: Brand;
  name: string;
  content: string;
  shortcut: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationEvent {
  id: string;
  conversation_id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  event_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  created_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string | null;
  phone_number: string;
  contact_name: string | null;
  brand: Brand;
  channel: Channel;
  mode: ConversationMode;
  status: ConversationStatus;
  assigned_to: string | null;
  is_first_contact: boolean;
  ai_reactivation_window_days: number;
  // Qualification fields (flattened from contact via API join)
  city: string | null;
  wedding_date: string | null;
  guest_count: string | null;
  budget_range: string | null;
  service_type: string | null;
  needs_human_reply: boolean;
  callback_required: boolean;
  manually_set_human: boolean;
  instagram_id: string | null;
  pushed_to_crm: boolean;
  crm_deal_id: number | null;
  crm_stage_id: number | null;
  crm_stage_name: string | null;
  pushed_to_crm_at: string | null;
  pushed_by_user_id: string | null;
  suggested_reply: string | null;
  suggested_reply_at: string | null;
  snoozed_until: string | null;
  tags: string[];
  lead_score: number;
  first_contact_at: string;
  last_message_at: string;
  last_human_message_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  last_message?: string | null;
  assigned_user_name?: string | null;
  contact_phone?: string | null;
  contact_instagram_id?: string | null;
  contact_notes?: string | null;
  sibling_conversations?: SiblingConversation[];
}

export interface SiblingConversation {
  id: string;
  channel: Channel;
  brand: Brand;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender: 'LEAD' | 'AI' | 'HUMAN';
  sender_user_id: string | null;
  content: string;
  whatsapp_message_id: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  sender_name?: string | null;
}

export interface SnoozePreset {
  label: string;
  hours: number;
}

export const SNOOZE_PRESETS: SnoozePreset[] = [
  { label: '1 hour', hours: 1 },
  { label: '3 hours', hours: 3 },
  { label: 'Tomorrow morning', hours: 16 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];

export interface QualificationData {
  brand: string;
  city: string | null;
  wedding_date: string | null;
  guest_count: string | null;
  budget_range: string | null;
  service_type: string | null;
  instagram_id: string | null;
  phone: string | null;
  is_qualified: boolean;
}
