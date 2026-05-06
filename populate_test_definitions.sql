-- Populate test_definitions table with all default tests
-- Run this once to initialize the database

INSERT INTO test_definitions (test_key, name, category, sort_order, enabled) VALUES
-- Soil tests
('grading', 'Grading (Sieve Analysis)', 'soil', 1, 1),
('atterberg', 'Atterberg Limits', 'soil', 2, 1),
('proctor', 'Proctor Test', 'soil', 3, 1),
('cbr', 'CBR', 'soil', 4, 1),
('shear', 'Shear Test', 'soil', 5, 1),
('consolidation', 'Consolidation', 'soil', 6, 1),

-- Concrete tests
('slump', 'Slump Test', 'concrete', 1, 1),
('compressive', 'Compressive Strength', 'concrete', 2, 1),
('upvt', 'UPVT', 'concrete', 3, 1),
('schmidt', 'Schmidt Hammer', 'concrete', 4, 1),
('coring', 'Coring', 'concrete', 5, 1),
('cubes', 'Concrete Cubes', 'concrete', 6, 1),

-- Rock tests
('ucs', 'UCS', 'rock', 1, 1),
('pointload', 'Point Load', 'rock', 2, 1),
('porosity', 'Porosity', 'rock', 3, 1),

-- Special tests
('spt', 'SPT', 'special', 1, 1),
('dcp', 'DCP', 'special', 2, 1);
