-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
--
-- Exported from the Supabase project. NOT included in this export, but used by the code:
--   * view  public.batch_emails  (emails joined with processed_emails; exposes result,
--     overall_confidence, classification_confidence, category, processed_id ...)
--   * RPCs  claim_next_email_processing_job, claim_next_email_processing_job_for_user,
--     claim_email_send, release_email_send, resolve_review, batch_email_stats
--   * table public.instruments (debug page only)
--   * Storage bucket for email attachments (see lib/email-processing/attachment-storage.ts)
--   * RLS policies

CREATE TABLE public.processed_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email_id text NOT NULL UNIQUE,
  reasoning text,
  status text,
  review_reason text,
  has_defect boolean DEFAULT false,
  defect_fields ARRAY DEFAULT '{}'::text[],
  categories jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  synced_email_id uuid,
  email_sent boolean DEFAULT false,
  CONSTRAINT processed_emails_pkey PRIMARY KEY (id),
  CONSTRAINT processed_emails_synced_email_id_fkey FOREIGN KEY (synced_email_id) REFERENCES public.emails(id)
);
CREATE TABLE public.emails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  from_address text NOT NULL,
  subject text NOT NULL DEFAULT ''::text,
  snippet text,
  body text,
  received_at timestamp with time zone NOT NULL,
  logged_at timestamp with time zone NOT NULL DEFAULT now(),
  is_unread boolean NOT NULL DEFAULT false,
  CONSTRAINT emails_pkey PRIMARY KEY (id),
  CONSTRAINT emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.email_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL,
  gmail_attachment_id text,
  filename text NOT NULL,
  mime_type text,
  size_bytes integer,
  extracted_text text,
  extraction_note text,
  position integer NOT NULL DEFAULT 0,
  storage_path text,
  CONSTRAINT email_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT email_attachments_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id)
);
CREATE TABLE public.email_sync_state (
  user_id uuid NOT NULL,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  last_status text,
  last_error text,
  history_id text,
  CONSTRAINT email_sync_state_pkey PRIMARY KEY (user_id),
  CONSTRAINT email_sync_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.email_processing_queue (
  email_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])),
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_processing_queue_pkey PRIMARY KEY (email_id),
  CONSTRAINT email_processing_queue_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id),
  CONSTRAINT email_processing_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.shipping_instructions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  processed_email_id uuid NOT NULL UNIQUE,
  shipper text,
  consignee text,
  notify_party text,
  port_of_loading text,
  port_of_discharge text,
  container_count text,
  gross_weight_kg text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shipping_instructions_pkey PRIMARY KEY (id),
  CONSTRAINT shipping_instructions_processed_email_id_fkey FOREIGN KEY (processed_email_id) REFERENCES public.processed_emails(id)
);
-- The UNIQUE on processed_email_id is load-bearing, not decoration: the three
-- document tables are written with upsert(..., { onConflict: "processed_email_id" }),
-- and ON CONFLICT needs a unique index on its target or Postgres raises 42P10.
CREATE TABLE public.shipping_instructions_request_details (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  processed_email_id uuid NOT NULL,
  shipper text,
  consignee text,
  notify_party text,
  port_of_loading text,
  port_of_discharge text,
  container_count text,
  gross_weight_kg text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  bl_filename text,
  CONSTRAINT shipping_instructions_request_details_pkey PRIMARY KEY (id),
  CONSTRAINT shipping_instructions_request_details_processed_email_id_key UNIQUE (processed_email_id),
  CONSTRAINT shipping_instructions_request_details_processed_email_id_fkey FOREIGN KEY (processed_email_id) REFERENCES public.processed_emails(id) ON DELETE CASCADE
);
CREATE TABLE public.review_resolutions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  processed_email_id uuid NOT NULL UNIQUE,
  review_reason text NOT NULL,
  decision text NOT NULL CHECK (decision = ANY (ARRAY['accepted'::text, 'rejected'::text])),
  action text NOT NULL,
  field_values jsonb,
  resolved_by uuid DEFAULT auth.uid(),
  resolved_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT review_resolutions_pkey PRIMARY KEY (id),
  CONSTRAINT review_resolutions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id),
  CONSTRAINT review_resolutions_processed_email_id_fkey FOREIGN KEY (processed_email_id) REFERENCES public.processed_emails(id)
);
CREATE TABLE public.bill_of_lading (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  processed_email_id uuid NOT NULL UNIQUE,
  shipper text,
  consignee text,
  notify_party text,
  port_of_loading text,
  port_of_discharge text,
  container_count text,
  gross_weight_kg text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bill_of_lading_pkey PRIMARY KEY (id),
  CONSTRAINT bill_of_lading_processed_email_id_fkey FOREIGN KEY (processed_email_id) REFERENCES public.processed_emails(id)
);
