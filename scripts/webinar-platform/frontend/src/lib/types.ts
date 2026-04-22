export interface Closer {
  id: string;
  slug: string;
  name: string;
  email: string;
  calendar_id: string;
  avatar_url: string | null;
  is_active: boolean;
}

export interface Slot {
  id: string;
  day_of_week: number;
  time: string;
  duration_minutes: number;
  max_participants: number;
  is_active: boolean;
  presenter_email: string;
}

export interface Session {
  id: string;
  slot_id: string | null;
  date: string;
  starts_at: string;
  ends_at: string;
  google_meet_link: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  cta_active: boolean;
  registration_count?: number;
  max_participants?: number;
  available?: number;
}

export interface Registration {
  id: string;
  session_id: string;
  access_token: string;
  name: string;
  email: string;
  phone: string;
  confirmed_at: string | null;
  attended_at: string | null;
  cancelled_at: string | null;
  converted: boolean;
  converted_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  registration_id: string | null;
  sender_type: "lead" | "presenter";
  presenter_email: string | null;
  content: string;
  is_deleted: boolean;
  created_at: string;
}
