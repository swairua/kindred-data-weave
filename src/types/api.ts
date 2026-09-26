export interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
  test_type?: string | null;
  sample_count?: number;
}

export type TestType = 'atterberg' | 'compressive' | 'rock' | 'concrete' | 'soil' | 'special';

/** One row of the compressive_tests table, as the wizard lists and edits them. */
export interface ApiCompressiveTestRow {
  id: number;
  project_id: number;
  test_key: string;
  date_tested: string;
  cement: string;
  fine_aggregate: string;
  coarse_aggregate: string;
  contractor: string;
  concrete_class: string;
  section: string;
  made_by: string;
  slump: string;
  client_ref: string;
  status?: string | null;
  created_at: string;
  updated_at: string;
}
