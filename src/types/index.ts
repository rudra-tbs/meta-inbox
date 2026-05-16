export type Brand = 'TBS' | 'RD';
export type Channel = 'WA' | 'IG';
export type ConversationMode = 'AI' | 'HUMAN';
export type ConversationStatus = 'ACTIVE' | 'QUALIFIED' | 'UNQUALIFIED' | 'CLOSED';
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

export interface Conversation {
  id: string;
  phone_number: string;
  contact_name: string | null;
  brand: Brand;
  channel: Channel;
  mode: ConversationMode;
  status: ConversationStatus;
  assigned_to: string | null;
  is_first_contact: boolean;
  ai_reactivation_window_days: number;
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
  pushed_to_crm_at: string | null;
  pushed_by_user_id: string | null;
  first_contact_at: string;
  last_message_at: string;
  last_human_message_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  last_message?: string | null;
  assigned_user_name?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender: 'LEAD' | 'AI' | 'HUMAN';
  sender_user_id: string | null;
  content: string;
  whatsapp_message_id: string | null;
  created_at: string;
  sender_name?: string | null;
}

export interface QualificationData {
  brand: string;
  city: string | null;
  wedding_date: string | null;
  guest_count: string | null;
  budget_range: string | null;
  service_type: string | null;
  is_qualified: boolean;
}
