import type {
  DashboardData,
  FullResource,
  ResourceListItem,
  ResourcePayload,
  ResourceStatus,
  ResourceType,
} from './types';

declare global {
  interface Window {
    resourceAPI: {
      getDashboard(): Promise<DashboardData>;
      listResources(filters: {
        type?: ResourceType | '';
        status?: ResourceStatus | 'all';
        search?: string;
      }): Promise<ResourceListItem[]>;
      getResource(id: string): Promise<FullResource | null>;
      saveResource(payload: ResourcePayload): Promise<FullResource>;
      deleteResource(id: string): Promise<{ deleted: boolean }>;
      copyText(value: string): Promise<{ copied: boolean }>;
    };
  }
}

export {};
