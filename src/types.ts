export type ResourceType =
  | 'proxy'
  | 'gift_card'
  | 'slynumber'
  | 'google_voice'
  | 'whatsapp'
  | 'linkedin_account';

export type ResourceStatus = 'active' | 'inactive' | 'expired' | 'archived';

export interface LinkedInEmployment {
  jobTitle: string;
  company: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface LinkedInEducation {
  school: string;
  degree: string;
  startYear: string;
  endYear: string;
  location: string;
}

export type ResourceDetails = Record<string, unknown>;

export interface DashboardData {
  total: number;
  active: number;
  expired: number;
  expiring30: number;
  giftBalanceCents: number;
  byType: Partial<Record<ResourceType, number>>;
  upcoming: Array<{
    id: string;
    type: ResourceType;
    label: string;
    status: ResourceStatus;
    expiresAt: string;
  }>;
}

export interface ResourceListItem {
  id: string;
  type: ResourceType;
  label: string;
  status: ResourceStatus;
  expiresAt: string | null;
  notes: string;
  summary: string;
  currentAmountCents?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourcePayload {
  id?: string;
  type: ResourceType;
  label: string;
  status: ResourceStatus;
  expiresAt: string;
  notes: string;
  details: ResourceDetails;
}

export interface FullResource extends Omit<ResourcePayload, 'id'> {
  id: string;
  createdAt: string;
  updatedAt: string;
}
