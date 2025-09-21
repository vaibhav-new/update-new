/*
  # Area-Admin System with Location Tracking

  1. New Tables
    - `states` - Indian states for location hierarchy
    - `districts` - Districts within states
    - `areas` - Areas within districts (managed by area admins)
    - `departments` - Government departments
    - `issue_assignments` - Track issue assignment workflow
    - `work_progress` - Track work completion with images

  2. Enhanced Tables
    - Update `profiles` to support area and department assignments
    - Update `issues` to support automatic area routing
    - Update workflow tracking

  3. Security
    - Enable RLS on all new tables
    - Add policies for area-based access control
    - Add workflow-based permissions
*/

-- Create states table
CREATE TABLE IF NOT EXISTS states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  country text DEFAULT 'India',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create districts table
CREATE TABLE IF NOT EXISTS districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid REFERENCES states(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(state_id, name)
);

-- Create areas table (managed by area admins)
CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid REFERENCES districts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  boundaries jsonb, -- GeoJSON for area boundaries
  population integer,
  area_super_admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(district_id, name)
);

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('roads', 'utilities', 'environment', 'safety', 'parks', 'planning', 'finance', 'administration')),
  description text,
  head_office_address text,
  contact_email text,
  contact_phone text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create issue assignments table for workflow tracking
CREATE TABLE IF NOT EXISTS issue_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES issues(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  assignment_type text NOT NULL CHECK (assignment_type IN ('area_admin', 'department_admin', 'contractor')),
  assignment_notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'reassigned', 'cancelled')),
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create work progress table for tracking completion with images
CREATE TABLE IF NOT EXISTS work_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES issues(id) ON DELETE CASCADE NOT NULL,
  assignment_id uuid REFERENCES issue_assignments(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  before_images text[], -- Images before work
  after_images text[] NOT NULL, -- Images after work completion
  work_details jsonb DEFAULT '{}',
  materials_used text[],
  cost_breakdown jsonb,
  completion_date date NOT NULL,
  quality_rating integer CHECK (quality_rating >= 1 AND quality_rating <= 5),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Update profiles table to support area and department assignments
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'assigned_area_id') THEN
    ALTER TABLE profiles ADD COLUMN assigned_area_id uuid REFERENCES areas(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'assigned_department_id') THEN
    ALTER TABLE profiles ADD COLUMN assigned_department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'level') THEN
    ALTER TABLE profiles ADD COLUMN level text DEFAULT 'Bronze';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'badges') THEN
    ALTER TABLE profiles ADD COLUMN badges text[] DEFAULT ARRAY[]::text[];
  END IF;
END $$;

-- Update user_type enum to include new admin types
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;
  
  -- Add the new constraint with additional user types
  ALTER TABLE profiles ADD CONSTRAINT profiles_user_type_check 
    CHECK (user_type IN ('user', 'admin', 'area_super_admin', 'department_admin', 'tender'));
END $$;

-- Update issues table to support workflow stages and better location tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'workflow_stage') THEN
    ALTER TABLE issues ADD COLUMN workflow_stage text DEFAULT 'reported' CHECK (workflow_stage IN ('reported', 'area_review', 'department_assigned', 'contractor_assigned', 'in_progress', 'department_review', 'area_approval', 'resolved'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'assigned_area_id') THEN
    ALTER TABLE issues ADD COLUMN assigned_area_id uuid REFERENCES areas(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'assigned_department_id') THEN
    ALTER TABLE issues ADD COLUMN assigned_department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'current_assignee_id') THEN
    ALTER TABLE issues ADD COLUMN current_assignee_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'final_resolution_notes') THEN
    ALTER TABLE issues ADD COLUMN final_resolution_notes text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'final_resolution_images') THEN
    ALTER TABLE issues ADD COLUMN final_resolution_images text[];
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE states ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_progress ENABLE ROW LEVEL SECURITY;

-- States policies (public read)
CREATE POLICY "Anyone can read active states"
  ON states FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage states"
  ON states FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Districts policies (public read)
CREATE POLICY "Anyone can read active districts"
  ON districts FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage districts"
  ON districts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Areas policies
CREATE POLICY "Anyone can read active areas"
  ON areas FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Area admins can read their assigned area"
  ON areas FOR SELECT TO authenticated
  USING (
    area_super_admin_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin')
    )
  );

CREATE POLICY "Admins can manage areas"
  ON areas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Departments policies
CREATE POLICY "Anyone can read active departments"
  ON departments FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Issue assignments policies
CREATE POLICY "Users can read relevant assignments"
  ON issue_assignments FOR SELECT TO authenticated
  USING (
    assigned_by = auth.uid() OR 
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM issues 
      WHERE id = issue_id AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

CREATE POLICY "Admins can create assignments"
  ON issue_assignments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = assigned_by AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

-- Work progress policies
CREATE POLICY "Users can read relevant work progress"
  ON work_progress FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid() OR
    reviewed_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM issues 
      WHERE id = issue_id AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

CREATE POLICY "Department admins can submit work progress"
  ON work_progress FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = submitted_by AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('department_admin', 'tender')
    )
  );

CREATE POLICY "Area admins can review work progress"
  ON work_progress FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin')
    )
  );

-- Insert Indian states
INSERT INTO states (name, code) VALUES
('Andhra Pradesh', 'AP'),
('Arunachal Pradesh', 'AR'),
('Assam', 'AS'),
('Bihar', 'BR'),
('Chhattisgarh', 'CG'),
('Delhi', 'DL'),
('Goa', 'GA'),
('Gujarat', 'GJ'),
('Haryana', 'HR'),
('Himachal Pradesh', 'HP'),
('Jharkhand', 'JH'),
('Karnataka', 'KA'),
('Kerala', 'KL'),
('Madhya Pradesh', 'MP'),
('Maharashtra', 'MH'),
('Manipur', 'MN'),
('Meghalaya', 'ML'),
('Mizoram', 'MZ'),
('Nagaland', 'NL'),
('Odisha', 'OR'),
('Punjab', 'PB'),
('Rajasthan', 'RJ'),
('Sikkim', 'SK'),
('Tamil Nadu', 'TN'),
('Telangana', 'TS'),
('Tripura', 'TR'),
('Uttar Pradesh', 'UP'),
('Uttarakhand', 'UK'),
('West Bengal', 'WB'),
('Andaman and Nicobar Islands', 'AN'),
('Chandigarh', 'CH'),
('Dadra and Nagar Haveli and Daman and Diu', 'DH'),
('Jammu and Kashmir', 'JK'),
('Ladakh', 'LA'),
('Lakshadweep', 'LD'),
('Puducherry', 'PY')
ON CONFLICT (name) DO NOTHING;

-- Insert sample districts for Delhi (you can expand this)
INSERT INTO districts (state_id, name, code) 
SELECT s.id, d.name, d.code
FROM states s,
(VALUES 
  ('Central Delhi', 'CD'),
  ('East Delhi', 'ED'),
  ('New Delhi', 'ND'),
  ('North Delhi', 'NTD'),
  ('North East Delhi', 'NED'),
  ('North West Delhi', 'NWD'),
  ('Shahdara', 'SHD'),
  ('South Delhi', 'SD'),
  ('South East Delhi', 'SED'),
  ('South West Delhi', 'SWD'),
  ('West Delhi', 'WD')
) AS d(name, code)
WHERE s.code = 'DL'
ON CONFLICT (state_id, name) DO NOTHING;

-- Insert sample areas for Central Delhi
INSERT INTO areas (district_id, name, code, description)
SELECT d.id, a.name, a.code, a.description
FROM districts d,
(VALUES 
  ('Connaught Place', 'CP', 'Commercial hub and business district'),
  ('Karol Bagh', 'KB', 'Shopping and residential area'),
  ('Paharganj', 'PG', 'Tourist and backpacker area'),
  ('Rajendra Place', 'RP', 'Commercial and office complex'),
  ('Daryaganj', 'DG', 'Historic area with markets'),
  ('Chandni Chowk', 'CC', 'Historic market area'),
  ('Civil Lines', 'CL', 'Administrative and residential area')
) AS a(name, code, description)
WHERE d.code = 'CD'
ON CONFLICT (district_id, name) DO NOTHING;

-- Insert government departments
INSERT INTO departments (name, code, category, description, contact_email, contact_phone) VALUES
('Public Works Department', 'PWD', 'roads', 'Road construction, maintenance, and infrastructure', 'pwd@delhi.gov.in', '+91-11-23392000'),
('Delhi Jal Board', 'DJB', 'utilities', 'Water supply and sewerage management', 'djb@delhi.gov.in', '+91-11-23673000'),
('Municipal Corporation of Delhi', 'MCD', 'utilities', 'Waste management, sanitation, and civic services', 'mcd@delhi.gov.in', '+91-11-23378000'),
('Delhi Pollution Control Committee', 'DPCC', 'environment', 'Environmental protection and pollution control', 'dpcc@delhi.gov.in', '+91-11-24367000'),
('Delhi Police', 'DP', 'safety', 'Law enforcement and public safety', 'delhipolice@gov.in', '+91-11-23490000'),
('Delhi Development Authority', 'DDA', 'planning', 'Urban planning and development', 'dda@delhi.gov.in', '+91-11-23792000'),
('Parks and Gardens Department', 'PGD', 'parks', 'Parks maintenance and horticulture', 'parks@delhi.gov.in', '+91-11-23396000'),
('Transport Department', 'TD', 'roads', 'Transportation and traffic management', 'transport@delhi.gov.in', '+91-11-23385000')
ON CONFLICT (code) DO NOTHING;

-- Create function to automatically assign issues to area admin based on location
CREATE OR REPLACE FUNCTION auto_assign_issue_to_area()
RETURNS TRIGGER AS $$
DECLARE
  area_record RECORD;
  area_admin_id uuid;
BEGIN
  -- Try to find area based on area field first
  IF NEW.area IS NOT NULL THEN
    SELECT a.id, a.area_super_admin_id INTO area_record
    FROM areas a
    INNER JOIN districts d ON a.district_id = d.id
    INNER JOIN states s ON d.state_id = s.id
    WHERE LOWER(a.name) = LOWER(NEW.area)
    AND a.is_active = true
    LIMIT 1;
    
    IF FOUND AND area_record.area_super_admin_id IS NOT NULL THEN
      NEW.assigned_area_id := area_record.id;
      NEW.current_assignee_id := area_record.area_super_admin_id;
      NEW.workflow_stage := 'area_review';
      
      -- Create assignment record
      INSERT INTO issue_assignments (
        issue_id, assigned_by, assigned_to, assignment_type, assignment_notes
      ) VALUES (
        NEW.id, NEW.user_id, area_record.area_super_admin_id, 'area_admin', 'Auto-assigned based on location'
      );
    END IF;
  END IF;
  
  -- If no area admin found, keep in reported stage for manual assignment
  IF NEW.current_assignee_id IS NULL THEN
    NEW.workflow_stage := 'reported';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-assignment
DROP TRIGGER IF EXISTS trigger_auto_assign_issue ON issues;
CREATE TRIGGER trigger_auto_assign_issue
  BEFORE INSERT ON issues
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_issue_to_area();

-- Create function to update issue workflow when assignments change
CREATE OR REPLACE FUNCTION update_issue_workflow()
RETURNS TRIGGER AS $$
BEGIN
  -- Update issue workflow stage based on assignment type
  IF NEW.assignment_type = 'area_admin' THEN
    UPDATE issues 
    SET workflow_stage = 'area_review', current_assignee_id = NEW.assigned_to
    WHERE id = NEW.issue_id;
  ELSIF NEW.assignment_type = 'department_admin' THEN
    UPDATE issues 
    SET workflow_stage = 'department_assigned', 
        current_assignee_id = NEW.assigned_to,
        assigned_department_id = (
          SELECT assigned_department_id FROM profiles WHERE id = NEW.assigned_to
        )
    WHERE id = NEW.issue_id;
  ELSIF NEW.assignment_type = 'contractor' THEN
    UPDATE issues 
    SET workflow_stage = 'contractor_assigned', current_assignee_id = NEW.assigned_to
    WHERE id = NEW.issue_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workflow updates
DROP TRIGGER IF EXISTS trigger_update_issue_workflow ON issue_assignments;
CREATE TRIGGER trigger_update_issue_workflow
  AFTER INSERT ON issue_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_issue_workflow();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_states_code ON states(code);
CREATE INDEX IF NOT EXISTS idx_districts_state_id ON districts(state_id);
CREATE INDEX IF NOT EXISTS idx_districts_code ON districts(code);
CREATE INDEX IF NOT EXISTS idx_areas_district_id ON areas(district_id);
CREATE INDEX IF NOT EXISTS idx_areas_code ON areas(code);
CREATE INDEX IF NOT EXISTS idx_areas_super_admin ON areas(area_super_admin_id);
CREATE INDEX IF NOT EXISTS idx_departments_category ON departments(category);
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
CREATE INDEX IF NOT EXISTS idx_issue_assignments_issue_id ON issue_assignments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignments_assigned_to ON issue_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_progress_issue_id ON work_progress(issue_id);
CREATE INDEX IF NOT EXISTS idx_work_progress_status ON work_progress(status);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_area ON profiles(assigned_area_id);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_department ON profiles(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_issues_workflow_stage ON issues(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_issues_assigned_area ON issues(assigned_area_id);
CREATE INDEX IF NOT EXISTS idx_issues_assigned_department ON issues(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_issues_current_assignee ON issues(current_assignee_id);

-- Create view for issue dashboard with all related data
CREATE OR REPLACE VIEW issue_dashboard AS
SELECT 
  i.*,
  p.full_name as reporter_name,
  p.email as reporter_email,
  p.user_type as reporter_type,
  a.name as area_name,
  a.code as area_code,
  d.name as department_name,
  d.category as department_category,
  assignee.full_name as current_assignee_name,
  assignee.user_type as current_assignee_type,
  wp.status as work_progress_status,
  wp.after_images as completion_images
FROM issues i
LEFT JOIN profiles p ON i.user_id = p.id
LEFT JOIN areas a ON i.assigned_area_id = a.id
LEFT JOIN departments d ON i.assigned_department_id = d.id
LEFT JOIN profiles assignee ON i.current_assignee_id = assignee.id
LEFT JOIN work_progress wp ON i.id = wp.issue_id AND wp.status = 'approved';

-- Create function to get area admin dashboard data
CREATE OR REPLACE FUNCTION get_area_admin_dashboard(admin_user_id uuid)
RETURNS TABLE (
  issues jsonb,
  departments jsonb,
  area_id uuid
) AS $$
DECLARE
  user_area_id uuid;
BEGIN
  -- Get the area assigned to this admin
  SELECT assigned_area_id INTO user_area_id
  FROM profiles
  WHERE id = admin_user_id AND user_type = 'area_super_admin';
  
  -- Return issues in this area
  RETURN QUERY
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'description', i.description,
        'category', i.category,
        'priority', i.priority,
        'status', i.status,
        'workflow_stage', i.workflow_stage,
        'location_name', i.location_name,
        'area', i.area,
        'created_at', i.created_at,
        'profiles', jsonb_build_object(
          'full_name', p.full_name,
          'email', p.email
        )
      )
    ) as issues,
    jsonb_agg(DISTINCT
      jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'category', d.category,
        'description', d.description
      )
    ) as departments,
    user_area_id as area_id
  FROM issues i
  LEFT JOIN profiles p ON i.user_id = p.id
  LEFT JOIN departments d ON d.is_active = true
  WHERE i.assigned_area_id = user_area_id
  OR (user_area_id IS NULL AND i.workflow_stage = 'reported');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get department admin dashboard data
CREATE OR REPLACE FUNCTION get_department_admin_dashboard(admin_user_id uuid)
RETURNS TABLE (
  issues jsonb,
  tenders jsonb,
  contractors jsonb,
  department_id uuid
) AS $$
DECLARE
  user_dept_id uuid;
BEGIN
  -- Get the department assigned to this admin
  SELECT assigned_department_id INTO user_dept_id
  FROM profiles
  WHERE id = admin_user_id AND user_type = 'department_admin';
  
  -- Return issues assigned to this department
  RETURN QUERY
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'description', i.description,
        'category', i.category,
        'priority', i.priority,
        'status', i.status,
        'workflow_stage', i.workflow_stage,
        'location_name', i.location_name,
        'created_at', i.created_at,
        'profiles', jsonb_build_object(
          'full_name', p.full_name,
          'email', p.email
        )
      )
    ) as issues,
    jsonb_agg(DISTINCT
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'status', t.status,
        'estimated_budget_min', t.estimated_budget_min,
        'estimated_budget_max', t.estimated_budget_max,
        'deadline_date', t.deadline_date
      )
    ) as tenders,
    jsonb_agg(DISTINCT
      jsonb_build_object(
        'id', contractor.id,
        'full_name', contractor.full_name,
        'email', contractor.email
      )
    ) as contractors,
    user_dept_id as department_id
  FROM issues i
  LEFT JOIN profiles p ON i.user_id = p.id
  LEFT JOIN tenders t ON t.department_id = user_dept_id AND t.status IN ('available', 'awarded', 'in_progress')
  LEFT JOIN profiles contractor ON contractor.user_type = 'tender' AND contractor.is_verified = true
  WHERE i.assigned_department_id = user_dept_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to assign issue to department
CREATE OR REPLACE FUNCTION assign_issue_to_department(
  issue_id uuid,
  department_id uuid,
  assignment_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  dept_admin_id uuid;
  result jsonb;
BEGIN
  -- Find department admin for this department
  SELECT id INTO dept_admin_id
  FROM profiles
  WHERE assigned_department_id = department_id 
  AND user_type = 'department_admin'
  AND is_verified = true
  LIMIT 1;
  
  IF dept_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No department admin found for this department');
  END IF;
  
  -- Create assignment
  INSERT INTO issue_assignments (
    issue_id, assigned_by, assigned_to, assignment_type, assignment_notes
  ) VALUES (
    issue_id, auth.uid(), dept_admin_id, 'department_admin', assignment_notes
  );
  
  -- Update issue
  UPDATE issues 
  SET 
    assigned_department_id = department_id,
    current_assignee_id = dept_admin_id,
    workflow_stage = 'department_assigned',
    updated_at = now()
  WHERE id = issue_id;
  
  RETURN jsonb_build_object('success', true, 'assigned_to', dept_admin_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to submit work completion
CREATE OR REPLACE FUNCTION submit_work_completion(
  issue_id uuid,
  title text,
  description text,
  after_images text[],
  before_images text[] DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  assignment_id uuid;
  result jsonb;
BEGIN
  -- Get current assignment
  SELECT id INTO assignment_id
  FROM issue_assignments
  WHERE issue_assignments.issue_id = submit_work_completion.issue_id
  AND assigned_to = auth.uid()
  AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Insert work progress
  INSERT INTO work_progress (
    issue_id, assignment_id, submitted_by, title, description, 
    before_images, after_images, completion_date
  ) VALUES (
    issue_id, assignment_id, auth.uid(), title, description,
    before_images, after_images, CURRENT_DATE
  );
  
  -- Update issue workflow
  UPDATE issues 
  SET 
    workflow_stage = 'department_review',
    status = 'in_progress',
    updated_at = now()
  WHERE id = issue_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to approve work completion (by area admin)
CREATE OR REPLACE FUNCTION approve_work_completion(
  work_progress_id uuid,
  review_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  progress_record RECORD;
BEGIN
  -- Get work progress record
  SELECT wp.*, i.id as issue_id INTO progress_record
  FROM work_progress wp
  INNER JOIN issues i ON wp.issue_id = i.id
  WHERE wp.id = work_progress_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Work progress record not found');
  END IF;
  
  -- Update work progress
  UPDATE work_progress 
  SET 
    status = 'approved',
    reviewed_by = auth.uid(),
    review_notes = approve_work_completion.review_notes,
    reviewed_at = now()
  WHERE id = work_progress_id;
  
  -- Update issue to resolved
  UPDATE issues 
  SET 
    status = 'resolved',
    workflow_stage = 'resolved',
    resolved_at = now(),
    final_resolution_notes = progress_record.description,
    final_resolution_images = progress_record.after_images,
    updated_at = now()
  WHERE id = progress_record.issue_id;
  
  -- Complete assignment
  UPDATE issue_assignments 
  SET status = 'completed', completed_at = now()
  WHERE issue_id = progress_record.issue_id AND status = 'active';
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create updated_at triggers for new tables
CREATE TRIGGER update_states_updated_at BEFORE UPDATE ON states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_districts_updated_at BEFORE UPDATE ON districts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_work_progress_updated_at BEFORE UPDATE ON work_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();