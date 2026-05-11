export interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
  test_type?: string | null;
  sample_count?: number;
}

export type TestType = 'atterberg' | 'compressive' | 'rock' | 'concrete' | 'soil' | 'special';
