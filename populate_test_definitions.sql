-- Populate test_definitions table with all default tests
-- Run this once to initialize the database

INSERT INTO test_definitions (test_key, name, category, sort_order, enabled) VALUES
-- Soil tests
('atterberg', 'Atterberg Limits', 'soil', 1, 1),
('grading', 'Particle Size Distribution', 'soil', 2, 1),
('proctor', 'Density/Moisture Content Relationship', 'soil', 3, 1),
('spt', 'Standard Penetration Test (SPT)', 'soil', 4, 1),
('cpt', 'Cone Penetration Test (CPT)', 'soil', 5, 1),

-- Rock tests
('ucs', 'Unconfined Compressive Strength', 'rock', 1, 1),
('pointload', 'Point Load Index', 'rock', 2, 1),
('schmidt_rock', 'Schmidt Hammer', 'rock', 3, 1),

-- Concrete tests
('compressive', 'Compressive Strength Test', 'concrete', 1, 1),
('slump', 'Slump Test', 'concrete', 2, 1),
('schmidt', 'NDT (Rebound Hammer)', 'concrete', 3, 1),

-- Other tests
('dcp', 'DCP', 'special', 1, 1);
