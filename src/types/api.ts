export interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
  test_type?: string | null;
  sample_count?: number;
}

export interface ApiTestDefinitionRow {
  id: number;
  test_key: string;
  name: string;
  category: "soil" | "concrete" | "rock" | "special";
  sort_order: number;
  enabled: boolean | number;
  created_at?: string;
  updated_at?: string;
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
  county?: string | null;
  concrete_class: string;
  section: string;
  made_by: string;
  slump: string;
  client_ref: string;
  lab_ref?: string | null;
  report_no?: string | null;
  date_received?: string | null;
  curing?: string | null;
  mode_of_failure?: string | null;
  comment?: string | null;
  custom_fields?: string | null;
  status?: string | null;
  created_at: string;
  updated_at: string;
}
