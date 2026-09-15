export type Gender = 'male' | 'female' | 'other';
export type UserRole = 'member' | 'admin';
export type RequestStatus =
  | 'requested'
  | 'review'
  | 'accepted'
  | 'transferred'
  | 'rejected';

export interface Profile {
  id: string;
  full_name: string;
  gender: Gender;
  age: number;
  country: string;
  city: string;
  email: string;
  mobile: string;
  nic_path: string | null;
  /* where approved funds are transferred — see supabase/migrations/0007 */
  bank_name: string | null;
  bank_account_title: string | null;
  bank_account_number: string | null;
  role: UserRole;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface FundType {
  id: string;
  name: string;
  description: string | null;
  gradient: string;
  icon: string;
  document_label: string;
  name_ur: string | null;
  description_ur: string | null;
  document_label_ur: string | null;
  document_required: boolean;
  /* approving one of these enrols the member for a monthly application */
  is_recurring: boolean;
  min_amount: number;
  max_amount: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface Attachment {
  id: string;
  request_id: string;
  user_id: string;
  path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  kind: string;
  created_at: string;
}

export interface RequestEvent {
  id: string;
  request_id: string;
  status: RequestStatus;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface FundRequest {
  id: string;
  reference: string;
  user_id: string;
  fund_type_id: string;
  amount_requested: number;
  amount_approved: number | null;
  purpose: string | null;
  status: RequestStatus;
  /* filed by the monthly generator rather than by the member */
  is_automatic: boolean;
  admin_note: string | null;
  reviewed_by: string | null;
  transfer_ref: string | null;
  transferred_at: string | null;
  created_at: string;
  updated_at: string;
  /* joined */
  fund_types?: FundType | null;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email' | 'mobile' | 'city' | 'country'> | null;
  request_attachments?: Attachment[];
  request_events?: RequestEvent[];
}

export interface RecurringGrant {
  id: string;
  user_id: string;
  fund_type_id: string;
  amount: number;
  source_request_id: string | null;
  is_active: boolean;
  last_generated_on: string | null;
  created_at: string;
  updated_at: string;
  /* joined */
  fund_types?: Pick<FundType, 'id' | 'name'> | null;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
}

export interface AdminStats {
  members: number;
  admins: number;
  requested: number;
  review: number;
  accepted: number;
  transferred: number;
  rejected: number;
  total_requested: number;
  total_disbursed: number;
  by_fund: { id: string; name: string; count: number; amount: number }[];
}
