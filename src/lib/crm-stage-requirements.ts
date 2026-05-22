// Stage-transition validation matrix mirrored from the CRM frontend
// (TBSCRM-Frontend: Deals.tsx:7772 / DealDetail.tsx:2185 and helpers).
//
// The backend (TBSCRM-Backend) does NOT enforce these rules — they live
// entirely in the CRM's React handlers, which means anything that bypasses
// that frontend (our inbox's raw SQL stage updates, future clients, bulk
// SQL) writes deals that violate the business contract. This module is
// our inbox-side enforcement of the same matrix, kept in lockstep so a
// stage move from DetailRail behaves identically to one from the CRM
// Dashboard.
//
// Out of scope (deprecated mechanisms confirmed dead):
//   - TBS Pre-sales (BRIDE_STYLE_PRESALES_PIPELINE_IDS = 58, 67) Prospect gate
//   - TBS RM "Committed" requirements modal
//   - TBS RM deal-value exemption on Qualified→next and Follow Up
//   - Org #117 special Qualified flow
//
// If shubham ever adds the rules to DealServiceImpl.updateStage we can
// retire this file — until then, the inbox uses it on every stage change.

export type MissingField =
  | 'venue'        // deals.venue
  | 'city'         // deals.city
  | 'value'        // deals.value (decimal > 0)
  | 'label'        // ≥1 row in deal_labels (Makeup category only)
  | 'phone'        // persons.phone (or deals.phone_number) non-empty
  | 'activities';  // 0 rows in activities WHERE deal_id=? AND done=0

export interface DealContext {
  deal: {
    id: number;
    venue: string | null;
    city: string | null;
    value: number | null;
    pipeline_id: number | null;
  };
  pipeline: {
    id: number;
    name: string;
    // pipelines.category — free text. Used as one of three signals for
    // the Makeup-category check.
    category: string | null;
  } | null;
  // organizations.category — free text. Resolved via pipelines.organization_id.
  organization_category: string | null;
  // categories.name — resolved via deals.category_id. Third signal for
  // the Makeup check.
  category_name: string | null;
  // EXISTS check on deal_labels for this deal — we only need the bool.
  has_any_label: boolean;
  person_phone: string | null;
  // Activity-completion gate. Count of activities rows where done = 0
  // for this deal; > 0 means the Qualified-forward gate trips.
  open_activity_count: number;
  current_stage: { id: number; name: string; stage_order: number };
  target_stage: { id: number; name: string; stage_order: number };
  // The pipeline's stages, ordered by stage_order. We need this to find
  // "Contact Made" and "Follow Up" by name and compare orders so the gate
  // fires for any stage at-or-beyond those, mirroring the CRM frontend.
  pipeline_stages: Array<{ id: number; name: string; stage_order: number }>;
}

export type RequirementResult =
  | { ok: true }
  | {
      ok: false;
      missing: MissingField[];
      // 'modal' → the inbox should open the inline form so the operator
      // can fill the field and retry. 'toast' → just show the message;
      // the operator has to go to the CRM Dashboard to fix it.
      ux: 'modal' | 'toast';
      message: string;
      // Stable identifier for the rule that fired; useful in logs and
      // Sentry tags so we can spot drift if the CRM frontend rules change.
      rule: string;
    };

function compactLower(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[\s_-]+/g, '');
}

function isMakeupCategory(ctx: DealContext): boolean {
  // Mirror the CRM's "is any of pipeline/org/category 'makeup'?" — the
  // frontend treats all three as equivalent signals. Trimmed + lowercased.
  const candidates = [ctx.pipeline?.category, ctx.organization_category, ctx.category_name];
  return candidates.some((c) => c?.trim().toLowerCase() === 'makeup');
}

function findStageByName(stages: DealContext['pipeline_stages'], names: string[]) {
  const targets = names.map(compactLower);
  return stages.find((s) => targets.includes(compactLower(s.name))) ?? null;
}

const STAGE_NAME = {
  leadIn: ['lead in', 'leadin', 'lead-in'],
  qualified: ['qualified'],
  contactMade: ['contact made', 'contactmade', 'contact-made'],
  followUp: ['follow up', 'followup', 'follow-up'],
  diversion: ['diversion'],
} as const;

export function evaluateStageRequirements(ctx: DealContext): RequirementResult {
  const { current_stage, target_stage, pipeline_stages } = ctx;

  // Rule 1: Diversion stage within the same pipeline is always blocked.
  if (compactLower(target_stage.name) === 'diversion') {
    return {
      ok: false,
      missing: [],
      ux: 'toast',
      message: 'Cannot move deal to Diversion stage within the same pipeline.',
      rule: 'DIVERSION_SAME_PIPELINE',
    };
  }

  const isForward = target_stage.stage_order > current_stage.stage_order;
  const isBackward = target_stage.stage_order < current_stage.stage_order;
  const makeup = isMakeupCategory(ctx);

  // Rule 2: Forward out of Lead In requires contact phone (unless Makeup).
  if (
    isForward &&
    STAGE_NAME.leadIn.map(compactLower).includes(compactLower(current_stage.name)) &&
    !makeup
  ) {
    const hasPhone = !!(ctx.person_phone && ctx.person_phone.trim().length > 0);
    if (!hasPhone) {
      return {
        ok: false,
        missing: ['phone'],
        ux: 'toast',
        message: 'Please add the contact number for moving the deal to the next stage.',
        rule: 'LEAD_IN_FORWARD_PHONE_REQUIRED',
      };
    }
  }

  // Rule 3: Leaving Qualified (forward or backward) requires all
  // activities completed. Forward also requires deal.value > 0.
  if (compactLower(current_stage.name) === 'qualified' && (isForward || isBackward)) {
    if (ctx.open_activity_count > 0) {
      return {
        ok: false,
        missing: ['activities'],
        ux: 'toast',
        message: isBackward
          ? "Can't go back to the previous stage, please finish your assigned activities to move to the next stage."
          : 'Please complete the assigned activities first to shift the deal to the next stage.',
        rule: 'QUALIFIED_ACTIVITIES_REQUIRED',
      };
    }
  }
  if (compactLower(current_stage.name) === 'qualified' && isForward) {
    const hasValue = ctx.deal.value != null && ctx.deal.value > 0;
    if (!hasValue) {
      return {
        ok: false,
        missing: ['value'],
        ux: 'modal',
        message: 'Add the deal value before moving out of Qualified.',
        rule: 'QUALIFIED_FORWARD_VALUE_REQUIRED',
      };
    }
  }

  // Rule 4: Moving to Contact Made or any stage at-or-beyond requires
  // venue + city, plus a label when the deal's category is Makeup.
  const contactMadeStage = findStageByName(pipeline_stages, [...STAGE_NAME.contactMade]);
  if (
    contactMadeStage &&
    target_stage.stage_order >= contactMadeStage.stage_order &&
    target_stage.id !== current_stage.id
  ) {
    const missing: MissingField[] = [];
    if (!(ctx.deal.venue && ctx.deal.venue.trim())) missing.push('venue');
    if (!(ctx.deal.city && ctx.deal.city.trim())) missing.push('city');
    if (makeup && !ctx.has_any_label) missing.push('label');
    if (missing.length > 0) {
      const list = missing.map((m) => (m === 'label' ? 'label' : m)).join(', ');
      return {
        ok: false,
        missing,
        ux: 'modal',
        message: `Add ${list} before moving to ${target_stage.name}.`,
        rule: 'CONTACT_MADE_OR_BEYOND_REQUIRES_VENUE_CITY',
      };
    }
  }

  // Rule 5: Target = Follow Up, OR any later stage reached by skipping
  // Follow Up while moving forward. Requires value + venue + (label if
  // Makeup). Note: when the target IS exactly Follow Up the venue/city
  // rule from Rule 4 has already fired if those were missing, so by the
  // time we get here venue is usually set. Keeping the value check
  // separate so the CRM's matrix is faithfully reproduced.
  const followUpStage = findStageByName(pipeline_stages, [...STAGE_NAME.followUp]);
  if (followUpStage) {
    const isTargetFollowUp = followUpStage.id === target_stage.id;
    const isSkippingFollowUp =
      isForward &&
      followUpStage.stage_order > current_stage.stage_order &&
      followUpStage.stage_order < target_stage.stage_order;
    if ((isTargetFollowUp || isSkippingFollowUp) && isForward) {
      const missing: MissingField[] = [];
      const hasValue = ctx.deal.value != null && ctx.deal.value > 0;
      const hasVenue = !!(ctx.deal.venue && ctx.deal.venue.trim());
      if (!hasValue) missing.push('value');
      if (!hasVenue) missing.push('venue');
      if (makeup && !ctx.has_any_label) missing.push('label');
      if (missing.length > 0) {
        const list = missing.map((m) => (m === 'label' ? 'label' : m)).join(', ');
        const stagePhrase = isSkippingFollowUp ? 'a stage after Follow Up' : 'Follow Up';
        return {
          ok: false,
          missing,
          ux: 'modal',
          message: `Cannot move to ${stagePhrase}. Add ${list}.`,
          rule: isTargetFollowUp ? 'FOLLOW_UP_REQUIRES_VALUE_VENUE' : 'SKIP_FOLLOW_UP_REQUIRES_VALUE_VENUE',
        };
      }
    }
  }

  return { ok: true };
}
