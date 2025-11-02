-- Add trashed column to fact table
ALTER TABLE fact ADD COLUMN IF NOT EXISTS trashed boolean DEFAULT false NOT NULL;

-- Create index for trashed column to improve search performance
CREATE INDEX IF NOT EXISTS idx_fact_trashed ON fact(trashed) WHERE trashed = false;

