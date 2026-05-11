export interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
  test_type?: string | null;
}

export type TestType = 'atterberg' | 'compressive' | 'rock' | 'concrete' | 'soil' | 'special';
