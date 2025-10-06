--
-- PostgreSQL database dump
--

\restrict 2pLFO5gpiCwQZSlj59CiovqU3qKzF1CzRKdU26tdmTsI6i6fbcJmfgNuFuumEgR

-- Dumped from database version 16.10 (Homebrew)
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: npfadmin
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO npfadmin;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: accounts_derive_fields(); Type: FUNCTION; Schema: public; Owner: bvasu
--

CREATE FUNCTION public.accounts_derive_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Set restriction from funds table based on fund_number
    SELECT restriction INTO NEW.restriction
    FROM funds
    WHERE fund_number = NEW.fund_number
    LIMIT 1;
    
    -- If restriction not found, use empty string
    IF NEW.restriction IS NULL THEN
        NEW.restriction := '';
    END IF;
    
    -- Set classification from gl_codes table based on gl_code
    SELECT classification INTO NEW.classification
    FROM gl_codes
    WHERE code = NEW.gl_code
    LIMIT 1;
    
    -- Compute account_code as concatenation with spaces
    NEW.account_code := CONCAT(
        COALESCE(NEW.entity_code, ''), ' ',
        COALESCE(NEW.gl_code, ''), ' ',
        COALESCE(NEW.fund_number, ''), ' ',
        COALESCE(NEW.restriction, '')
    );
    
    -- Set last_used to current date on INSERT if null
    IF TG_OP = 'INSERT' AND NEW.last_used IS NULL THEN
        NEW.last_used := CURRENT_DATE;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.accounts_derive_fields() OWNER TO bvasu;

--
-- Name: accounts_set_updated_at(); Type: FUNCTION; Schema: public; Owner: bvasu
--

CREATE FUNCTION public.accounts_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END
    $$;


ALTER FUNCTION public.accounts_set_updated_at() OWNER TO bvasu;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    account_code character varying(25) NOT NULL,
    description character varying(100) NOT NULL,
    classification character varying(50),
    beginning_balance numeric(15,2) DEFAULT 0.00,
    status character varying(10) DEFAULT 'Active'::character varying NOT NULL,
    last_used date DEFAULT CURRENT_DATE NOT NULL,
    entity_code character varying(10) NOT NULL,
    gl_code character varying(10) NOT NULL,
    fund_number character varying(10) NOT NULL,
    restriction character varying(10) NOT NULL,
    balance_sheet character varying(10) DEFAULT 'No'::character varying NOT NULL,
    beginning_balance_date date,
    CONSTRAINT accounts_balance_sheet_check CHECK (((balance_sheet)::text = ANY ((ARRAY['Yes'::character varying, 'No'::character varying])::text[]))),
    CONSTRAINT accounts_status_check CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying])::text[])))
);


ALTER TABLE public.accounts OWNER TO bvasu;

--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_id uuid NOT NULL,
    gl_account_id uuid,
    bank_name character varying(100) NOT NULL,
    account_name character varying(100) NOT NULL,
    account_number character varying(50) NOT NULL,
    routing_number character varying(20) NOT NULL,
    type character varying(20) NOT NULL,
    balance numeric(15,2) DEFAULT 0.00,
    last_reconciliation_date date,
    status character varying(20) DEFAULT 'Active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_reconciliation_id uuid,
    reconciled_balance numeric(15,2) DEFAULT 0.00,
    connection_method character varying(50) DEFAULT 'Manual'::character varying,
    last_sync timestamp with time zone,
    description text,
    cash_account_id uuid,
    beginning_balance numeric(15,2) DEFAULT 0.00,
    beginning_balance_date date
);


ALTER TABLE public.bank_accounts OWNER TO npfadmin;

--
-- Name: bank_deposit_items; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.bank_deposit_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    deposit_id uuid NOT NULL,
    item_type character varying(50) NOT NULL,
    amount numeric(15,2) DEFAULT 0.00 NOT NULL,
    check_number character varying(50),
    check_date date,
    payer_name character varying(100),
    description text,
    gl_account_id uuid,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    journal_entry_id uuid
);


ALTER TABLE public.bank_deposit_items OWNER TO bvasu;

--
-- Name: bank_deposits; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.bank_deposits (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_account_id uuid NOT NULL,
    deposit_date date NOT NULL,
    deposit_type character varying(50) NOT NULL,
    reference_number character varying(50),
    description text,
    memo text,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    submitted_date timestamp without time zone,
    submitted_by uuid,
    cleared_date date,
    clearing_reference character varying(100),
    cleared_by uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_bank_deposit_status CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Submitted'::character varying, 'Cleared'::character varying, 'Rejected'::character varying])::text[])))
);


ALTER TABLE public.bank_deposits OWNER TO bvasu;

--
-- Name: bank_reconciliation_adjustments; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.bank_reconciliation_adjustments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_reconciliation_id uuid NOT NULL,
    adjustment_date date NOT NULL,
    description text NOT NULL,
    adjustment_type character varying(50) NOT NULL,
    amount numeric(15,2) NOT NULL,
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_bank_rec_adj_status CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying])::text[])))
);


ALTER TABLE public.bank_reconciliation_adjustments OWNER TO bvasu;

--
-- Name: bank_reconciliation_items; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.bank_reconciliation_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_reconciliation_id uuid NOT NULL,
    bank_statement_transaction_id uuid,
    journal_entry_item_id uuid,
    match_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'Matched'::character varying NOT NULL,
    amount numeric(15,2) NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.bank_reconciliation_items OWNER TO bvasu;

--
-- Name: bank_reconciliations; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.bank_reconciliations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_account_id uuid NOT NULL,
    bank_statement_id uuid,
    reconciliation_date date NOT NULL,
    start_balance numeric(15,2) NOT NULL,
    end_balance numeric(15,2) NOT NULL,
    book_balance numeric(15,2) NOT NULL,
    statement_balance numeric(15,2) NOT NULL,
    difference numeric(15,2) DEFAULT 0.00 NOT NULL,
    status character varying(20) DEFAULT 'In Progress'::character varying NOT NULL,
    notes text,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_bank_rec_status CHECK (((status)::text = ANY ((ARRAY['In Progress'::character varying, 'Completed'::character varying, 'Approved'::character varying])::text[])))
);


ALTER TABLE public.bank_reconciliations OWNER TO bvasu;

--
-- Name: bank_statement_transactions; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.bank_statement_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_statement_id uuid NOT NULL,
    transaction_date date NOT NULL,
    description text NOT NULL,
    reference character varying(100),
    amount numeric(15,2) NOT NULL,
    running_balance numeric(15,2),
    transaction_type character varying(20) NOT NULL,
    check_number character varying(50),
    status character varying(20) DEFAULT 'Unmatched'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_bank_tx_status CHECK (((status)::text = ANY ((ARRAY['Unmatched'::character varying, 'Matched'::character varying, 'Ignored'::character varying])::text[])))
);


ALTER TABLE public.bank_statement_transactions OWNER TO bvasu;

--
-- Name: bank_statements; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.bank_statements (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_account_id uuid NOT NULL,
    statement_date date NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    opening_balance numeric(15,2) NOT NULL,
    closing_balance numeric(15,2) NOT NULL,
    status character varying(20) DEFAULT 'Uploaded'::character varying NOT NULL,
    file_name character varying(255),
    file_path character varying(1024),
    import_method character varying(50) DEFAULT 'Manual'::character varying,
    notes text,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_bank_statement_status CHECK (((status)::text = ANY ((ARRAY['Uploaded'::character varying, 'Processed'::character varying, 'Reconciled'::character varying])::text[])))
);


ALTER TABLE public.bank_statements OWNER TO bvasu;

--
-- Name: budgets; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.budgets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_id uuid NOT NULL,
    fund_id uuid NOT NULL,
    account_id uuid NOT NULL,
    fiscal_year character varying(4) NOT NULL,
    period character varying(10) NOT NULL,
    amount numeric(15,2) DEFAULT 0.00 NOT NULL,
    status character varying(20) DEFAULT 'Active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.budgets OWNER TO npfadmin;

--
-- Name: check_formats; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.check_formats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    format_name character varying(100) NOT NULL,
    description text,
    check_width numeric(8,2) NOT NULL,
    check_height numeric(8,2) NOT NULL,
    payee_x numeric(8,2) NOT NULL,
    payee_y numeric(8,2) NOT NULL,
    date_x numeric(8,2) NOT NULL,
    date_y numeric(8,2) NOT NULL,
    amount_x numeric(8,2) NOT NULL,
    amount_y numeric(8,2) NOT NULL,
    amount_words_x numeric(8,2) NOT NULL,
    amount_words_y numeric(8,2) NOT NULL,
    memo_x numeric(8,2) NOT NULL,
    memo_y numeric(8,2) NOT NULL,
    signature_x numeric(8,2) NOT NULL,
    signature_y numeric(8,2) NOT NULL,
    font_name character varying(100) DEFAULT 'Arial'::character varying,
    font_size_normal numeric(5,2) DEFAULT 10.00,
    font_size_amount numeric(5,2) DEFAULT 12.00,
    format_data jsonb,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.check_formats OWNER TO bvasu;

--
-- Name: company_nacha_settings; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.company_nacha_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_id uuid NOT NULL,
    settlement_account_id uuid,
    company_name character varying(100) NOT NULL,
    company_id character varying(10) NOT NULL,
    originating_dfi_id character varying(10) NOT NULL,
    immediate_destination character varying(10),
    immediate_origin character varying(10),
    company_entry_description character varying(10) DEFAULT 'PAYMENT'::character varying,
    is_production boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.company_nacha_settings OWNER TO npfadmin;

--
-- Name: custom_report_definitions; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.custom_report_definitions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    definition_json jsonb NOT NULL,
    created_by character varying(100),
    is_public boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.custom_report_definitions OWNER TO npfadmin;

--
-- Name: entities; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.entities (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    parent_entity_id uuid,
    is_consolidated boolean DEFAULT false,
    fiscal_year_start character varying(5) DEFAULT '01-01'::character varying,
    base_currency character(3) DEFAULT 'USD'::bpchar,
    status character varying(20) DEFAULT 'Active'::character varying,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.entities OWNER TO npfadmin;

--
-- Name: funds; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.funds (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    fund_code character varying(10) NOT NULL,
    fund_name character varying(100) NOT NULL,
    restriction_type character varying(50) DEFAULT 'unrestricted'::character varying,
    status character varying(20) DEFAULT 'Active'::character varying,
    last_used date DEFAULT CURRENT_DATE NOT NULL,
    fund_number character varying(10) NOT NULL,
    entity_name character varying(10) NOT NULL,
    entity_code character varying(10) NOT NULL,
    restriction character varying(10) NOT NULL,
    budget character varying(10) NOT NULL,
    balance_sheet character varying(10) NOT NULL,
    balance numeric(14,2) DEFAULT 0 NOT NULL,
    starting_balance numeric(14,2) DEFAULT 0 NOT NULL,
    starting_balance_date date DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT chk_funds_balance_sheet CHECK (((balance_sheet)::text = ANY ((ARRAY['Yes'::character varying, 'No'::character varying])::text[]))),
    CONSTRAINT chk_funds_budget CHECK (((budget)::text = ANY ((ARRAY['Yes'::character varying, 'No'::character varying])::text[]))),
    CONSTRAINT chk_funds_entity_code CHECK (((entity_code)::text = ANY ((ARRAY['1'::character varying, '2'::character varying, '3'::character varying])::text[]))),
    CONSTRAINT chk_funds_entity_name CHECK (((entity_name)::text = ANY ((ARRAY['TPF'::character varying, 'TPFES'::character varying, 'NFCSN'::character varying])::text[]))),
    CONSTRAINT chk_funds_restriction CHECK (((restriction)::text = ANY (ARRAY[('00'::character varying)::text, ('01'::character varying)::text, ('02'::character varying)::text, ('03'::character varying)::text])))
);


ALTER TABLE public.funds OWNER TO npfadmin;

--
-- Name: gl_codes; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.gl_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    description text,
    classification text,
    line_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    budget character varying(10),
    balance_sheet character varying(10),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_gl_codes_line_type CHECK (((line_type)::text = ANY ((ARRAY['Asset'::character varying, 'Credit Card'::character varying, 'Liability'::character varying, 'Equity'::character varying, 'Revenue'::character varying, 'Expense'::character varying])::text[]))),
    CONSTRAINT chk_gl_codes_status CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying])::text[])))
);


ALTER TABLE public.gl_codes OWNER TO bvasu;

--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_id uuid NOT NULL,
    target_entity_id uuid,
    import_id uuid,
    entry_date date NOT NULL,
    reference_number character varying(50),
    description text,
    total_amount numeric(15,2) DEFAULT 0.00 NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying,
    is_inter_entity boolean DEFAULT false,
    matching_transaction_id uuid,
    entry_type character varying(50) DEFAULT 'standard'::character varying,
    created_by character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    entry_mode character varying(10) DEFAULT 'Manual'::character varying NOT NULL,
    CONSTRAINT chk_journal_entries_entry_mode CHECK (((entry_mode)::text = ANY ((ARRAY['Auto'::character varying, 'Manual'::character varying])::text[])))
);


ALTER TABLE public.journal_entries OWNER TO npfadmin;

--
-- Name: journal_entry_items; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.journal_entry_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    journal_entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    fund_id uuid NOT NULL,
    debit numeric(15,2) DEFAULT 0.00,
    credit numeric(15,2) DEFAULT 0.00,
    description text,
    transfer_fund_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_debit_credit_not_both_zero CHECK (((debit > (0)::numeric) OR (credit > (0)::numeric))),
    CONSTRAINT chk_debit_or_credit_only CHECK ((((debit > (0)::numeric) AND (credit = (0)::numeric)) OR ((credit > (0)::numeric) AND (debit = (0)::numeric))))
);


ALTER TABLE public.journal_entry_items OWNER TO npfadmin;

--
-- Name: nacha_files; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.nacha_files (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    payment_batch_id uuid NOT NULL,
    filename character varying(100) NOT NULL,
    file_date date NOT NULL,
    file_content text NOT NULL,
    status character varying(20) DEFAULT 'Generated'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.nacha_files OWNER TO npfadmin;

--
-- Name: payment_batches; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.payment_batches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_id uuid NOT NULL,
    fund_id uuid NOT NULL,
    nacha_settings_id uuid,
    batch_number character varying(50) NOT NULL,
    batch_date date NOT NULL,
    effective_date date NOT NULL,
    total_amount numeric(15,2) DEFAULT 0.00 NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying,
    created_by character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.payment_batches OWNER TO npfadmin;

--
-- Name: payment_items; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.payment_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    payment_batch_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    journal_entry_id uuid,
    amount numeric(15,2) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'Pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.payment_items OWNER TO npfadmin;

--
-- Name: printed_checks; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.printed_checks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_account_id uuid NOT NULL,
    check_number character varying(20) NOT NULL,
    check_date date NOT NULL,
    payee_name character varying(100) NOT NULL,
    vendor_id uuid,
    amount numeric(15,2) NOT NULL,
    amount_in_words text NOT NULL,
    memo text,
    address_line1 character varying(255),
    address_line2 character varying(255),
    address_city character varying(100),
    address_state character varying(50),
    address_zip character varying(20),
    check_format_id uuid,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    created_by uuid,
    printed_by uuid,
    voided_by uuid,
    cleared_by uuid,
    printed_date timestamp without time zone,
    voided_date timestamp without time zone,
    cleared_date timestamp without time zone,
    void_reason text,
    clearing_reference character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_check_status CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Printed'::character varying, 'Voided'::character varying, 'Cleared'::character varying])::text[])))
);


ALTER TABLE public.printed_checks OWNER TO bvasu;

--
-- Name: schema_meta; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.schema_meta (
    version character varying(64) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_meta OWNER TO bvasu;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: bvasu
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO bvasu;

--
-- Name: users; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email character varying(100),
    first_name character varying(50),
    last_name character varying(50),
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.users OWNER TO npfadmin;

--
-- Name: vendors; Type: TABLE; Schema: public; Owner: npfadmin
--

CREATE TABLE public.vendors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    tax_id character varying(20),
    contact_name character varying(100),
    email character varying(100),
    street_1 character varying(100),
    street_2 character varying(100),
    city character varying(50),
    state character varying(50),
    zip character varying(20),
    country character varying(50) DEFAULT 'USA'::character varying,
    status character varying(20) DEFAULT 'Active'::character varying,
    name_detail text,
    vendor_type character varying(50),
    subject_to_1099 boolean DEFAULT false,
    bank_account_type character varying(20),
    bank_routing_number character varying(20),
    bank_account_number character varying(50),
    last_used date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    account_type character varying(100) NOT NULL,
    payment_type character varying(100),
    zid text,
    CONSTRAINT chk_vendor_account_type_enum CHECK ((lower((account_type)::text) = ANY (ARRAY['individual'::text, 'business'::text]))),
    CONSTRAINT chk_vendor_payment_type_enum CHECK ((lower((payment_type)::text) = ANY (ARRAY['eft'::text, 'check'::text, 'paypal'::text, 'autodraft'::text, 'cap one'::text, 'convera'::text]))),
    CONSTRAINT chk_vendor_status_values CHECK ((lower((status)::text) = ANY (ARRAY['active'::text, 'inactive'::text])))
);


ALTER TABLE public.vendors OWNER TO npfadmin;

--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_deposit_items bank_deposit_items_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposit_items
    ADD CONSTRAINT bank_deposit_items_pkey PRIMARY KEY (id);


--
-- Name: bank_deposits bank_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposits
    ADD CONSTRAINT bank_deposits_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliation_adjustments bank_reconciliation_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_adjustments
    ADD CONSTRAINT bank_reconciliation_adjustments_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliation_items bank_reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_items
    ADD CONSTRAINT bank_reconciliation_items_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliations bank_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: bank_statement_transactions bank_statement_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_statement_transactions
    ADD CONSTRAINT bank_statement_transactions_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_entity_id_fund_id_account_id_fiscal_year_period_key; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_entity_id_fund_id_account_id_fiscal_year_period_key UNIQUE (entity_id, fund_id, account_id, fiscal_year, period);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: check_formats check_formats_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.check_formats
    ADD CONSTRAINT check_formats_pkey PRIMARY KEY (id);


--
-- Name: company_nacha_settings company_nacha_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.company_nacha_settings
    ADD CONSTRAINT company_nacha_settings_pkey PRIMARY KEY (id);


--
-- Name: custom_report_definitions custom_report_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.custom_report_definitions
    ADD CONSTRAINT custom_report_definitions_pkey PRIMARY KEY (id);


--
-- Name: entities entities_code_key; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_code_key UNIQUE (code);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: funds funds_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.funds
    ADD CONSTRAINT funds_pkey PRIMARY KEY (id);


--
-- Name: gl_codes gl_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.gl_codes
    ADD CONSTRAINT gl_codes_code_key UNIQUE (code);


--
-- Name: gl_codes gl_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.gl_codes
    ADD CONSTRAINT gl_codes_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_entry_items journal_entry_items_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entry_items
    ADD CONSTRAINT journal_entry_items_pkey PRIMARY KEY (id);


--
-- Name: nacha_files nacha_files_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.nacha_files
    ADD CONSTRAINT nacha_files_pkey PRIMARY KEY (id);


--
-- Name: payment_batches payment_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.payment_batches
    ADD CONSTRAINT payment_batches_pkey PRIMARY KEY (id);


--
-- Name: payment_items payment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_pkey PRIMARY KEY (id);


--
-- Name: printed_checks printed_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_pkey PRIMARY KEY (id);


--
-- Name: schema_meta schema_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.schema_meta
    ADD CONSTRAINT schema_meta_pkey PRIMARY KEY (version);


--
-- Name: printed_checks unique_check_number_per_account; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT unique_check_number_per_account UNIQUE (bank_account_id, check_number);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: idx_accounts_account_code; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_accounts_account_code ON public.accounts USING btree (account_code);


--
-- Name: idx_accounts_fund_number; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_accounts_fund_number ON public.accounts USING btree (fund_number);


--
-- Name: idx_accounts_gl_code; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_accounts_gl_code ON public.accounts USING btree (gl_code);


--
-- Name: idx_bank_deposit_items_account; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_deposit_items_account ON public.bank_deposit_items USING btree (gl_account_id);


--
-- Name: idx_bank_deposit_items_deposit; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_deposit_items_deposit ON public.bank_deposit_items USING btree (deposit_id);


--
-- Name: idx_bank_deposit_items_journal_entry; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_deposit_items_journal_entry ON public.bank_deposit_items USING btree (journal_entry_id);


--
-- Name: idx_bank_deposit_items_type; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_deposit_items_type ON public.bank_deposit_items USING btree (item_type);


--
-- Name: idx_bank_deposits_account; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_deposits_account ON public.bank_deposits USING btree (bank_account_id);


--
-- Name: idx_bank_deposits_date; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_deposits_date ON public.bank_deposits USING btree (deposit_date);


--
-- Name: idx_bank_deposits_status; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_deposits_status ON public.bank_deposits USING btree (status);


--
-- Name: idx_bank_rec_adjs_rec; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_rec_adjs_rec ON public.bank_reconciliation_adjustments USING btree (bank_reconciliation_id);


--
-- Name: idx_bank_rec_items_jei; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_rec_items_jei ON public.bank_reconciliation_items USING btree (journal_entry_item_id);


--
-- Name: idx_bank_rec_items_rec; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_rec_items_rec ON public.bank_reconciliation_items USING btree (bank_reconciliation_id);


--
-- Name: idx_bank_rec_items_stmt_tx; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_rec_items_stmt_tx ON public.bank_reconciliation_items USING btree (bank_statement_transaction_id);


--
-- Name: idx_bank_recs_account; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_recs_account ON public.bank_reconciliations USING btree (bank_account_id);


--
-- Name: idx_bank_recs_date; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_recs_date ON public.bank_reconciliations USING btree (reconciliation_date);


--
-- Name: idx_bank_recs_status; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_recs_status ON public.bank_reconciliations USING btree (status);


--
-- Name: idx_bank_statement_tx_date; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_statement_tx_date ON public.bank_statement_transactions USING btree (transaction_date);


--
-- Name: idx_bank_statement_tx_status; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_statement_tx_status ON public.bank_statement_transactions USING btree (status);


--
-- Name: idx_bank_statement_tx_stmt; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_statement_tx_stmt ON public.bank_statement_transactions USING btree (bank_statement_id);


--
-- Name: idx_bank_statements_account; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_statements_account ON public.bank_statements USING btree (bank_account_id);


--
-- Name: idx_bank_statements_date; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_statements_date ON public.bank_statements USING btree (statement_date);


--
-- Name: idx_bank_statements_status; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_bank_statements_status ON public.bank_statements USING btree (status);


--
-- Name: idx_check_formats_default; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_check_formats_default ON public.check_formats USING btree (is_default);


--
-- Name: idx_funds_fund_code; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_funds_fund_code ON public.funds USING btree (fund_code);


--
-- Name: idx_funds_fund_number; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_funds_fund_number ON public.funds USING btree (fund_number);


--
-- Name: idx_gl_codes_line_type; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_gl_codes_line_type ON public.gl_codes USING btree (line_type);


--
-- Name: idx_gl_codes_status; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_gl_codes_status ON public.gl_codes USING btree (status);


--
-- Name: idx_journal_entries_entity_id; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_journal_entries_entity_id ON public.journal_entries USING btree (entity_id);


--
-- Name: idx_journal_entries_entry_date; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_journal_entries_entry_date ON public.journal_entries USING btree (entry_date);


--
-- Name: idx_journal_entry_items_account_id; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_journal_entry_items_account_id ON public.journal_entry_items USING btree (account_id);


--
-- Name: idx_journal_entry_items_fund_id; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_journal_entry_items_fund_id ON public.journal_entry_items USING btree (fund_id);


--
-- Name: idx_journal_entry_items_journal_entry_id; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_journal_entry_items_journal_entry_id ON public.journal_entry_items USING btree (journal_entry_id);


--
-- Name: idx_payment_items_payment_batch_id; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_payment_items_payment_batch_id ON public.payment_items USING btree (payment_batch_id);


--
-- Name: idx_printed_checks_account; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_printed_checks_account ON public.printed_checks USING btree (bank_account_id);


--
-- Name: idx_printed_checks_date; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_printed_checks_date ON public.printed_checks USING btree (check_date);


--
-- Name: idx_printed_checks_status; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_printed_checks_status ON public.printed_checks USING btree (status);


--
-- Name: idx_user_sessions_expire; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE INDEX idx_user_sessions_expire ON public.user_sessions USING btree (expire);


--
-- Name: idx_vendors_account_type; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE INDEX idx_vendors_account_type ON public.vendors USING btree (account_type);


--
-- Name: uidx_funds_fund_code_lower; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE UNIQUE INDEX uidx_funds_fund_code_lower ON public.funds USING btree (lower((fund_code)::text)) WHERE (fund_code IS NOT NULL);


--
-- Name: uidx_gl_codes_code_lower; Type: INDEX; Schema: public; Owner: bvasu
--

CREATE UNIQUE INDEX uidx_gl_codes_code_lower ON public.gl_codes USING btree (lower((code)::text));


--
-- Name: uidx_vendors_zid_lower_not_null; Type: INDEX; Schema: public; Owner: npfadmin
--

CREATE UNIQUE INDEX uidx_vendors_zid_lower_not_null ON public.vendors USING btree (lower(zid)) WHERE (zid IS NOT NULL);


--
-- Name: accounts trg_accounts_derive_fields; Type: TRIGGER; Schema: public; Owner: bvasu
--

CREATE TRIGGER trg_accounts_derive_fields BEFORE INSERT OR UPDATE OF entity_code, gl_code, fund_number, restriction ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.accounts_derive_fields();


--
-- Name: accounts accounts_entity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_entity_code_fkey FOREIGN KEY (entity_code) REFERENCES public.entities(code) ON DELETE RESTRICT;


--
-- Name: accounts accounts_gl_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_gl_code_fkey FOREIGN KEY (gl_code) REFERENCES public.gl_codes(code) ON DELETE RESTRICT;


--
-- Name: bank_accounts bank_accounts_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id);


--
-- Name: bank_accounts bank_accounts_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.accounts(id) NOT VALID;


--
-- Name: bank_deposit_items bank_deposit_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposit_items
    ADD CONSTRAINT bank_deposit_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bank_deposit_items bank_deposit_items_deposit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposit_items
    ADD CONSTRAINT bank_deposit_items_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.bank_deposits(id) ON DELETE CASCADE;


--
-- Name: bank_deposit_items bank_deposit_items_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposit_items
    ADD CONSTRAINT bank_deposit_items_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.accounts(id) NOT VALID;


--
-- Name: bank_deposit_items bank_deposit_items_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposit_items
    ADD CONSTRAINT bank_deposit_items_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: bank_deposits bank_deposits_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposits
    ADD CONSTRAINT bank_deposits_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;


--
-- Name: bank_deposits bank_deposits_cleared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposits
    ADD CONSTRAINT bank_deposits_cleared_by_fkey FOREIGN KEY (cleared_by) REFERENCES public.users(id);


--
-- Name: bank_deposits bank_deposits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposits
    ADD CONSTRAINT bank_deposits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bank_deposits bank_deposits_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposits
    ADD CONSTRAINT bank_deposits_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: bank_deposits bank_deposits_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_deposits
    ADD CONSTRAINT bank_deposits_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: bank_reconciliation_adjustments bank_reconciliation_adjustments_bank_reconciliation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_adjustments
    ADD CONSTRAINT bank_reconciliation_adjustments_bank_reconciliation_id_fkey FOREIGN KEY (bank_reconciliation_id) REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE;


--
-- Name: bank_reconciliation_adjustments bank_reconciliation_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_adjustments
    ADD CONSTRAINT bank_reconciliation_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bank_reconciliation_items bank_reconciliation_items_bank_reconciliation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_items
    ADD CONSTRAINT bank_reconciliation_items_bank_reconciliation_id_fkey FOREIGN KEY (bank_reconciliation_id) REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE;


--
-- Name: bank_reconciliation_items bank_reconciliation_items_bank_statement_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_items
    ADD CONSTRAINT bank_reconciliation_items_bank_statement_transaction_id_fkey FOREIGN KEY (bank_statement_transaction_id) REFERENCES public.bank_statement_transactions(id);


--
-- Name: bank_reconciliation_items bank_reconciliation_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_items
    ADD CONSTRAINT bank_reconciliation_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bank_reconciliation_items bank_reconciliation_items_journal_entry_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliation_items
    ADD CONSTRAINT bank_reconciliation_items_journal_entry_item_id_fkey FOREIGN KEY (journal_entry_item_id) REFERENCES public.journal_entry_items(id);


--
-- Name: bank_reconciliations bank_reconciliations_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: bank_reconciliations bank_reconciliations_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;


--
-- Name: bank_reconciliations bank_reconciliations_bank_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_bank_statement_id_fkey FOREIGN KEY (bank_statement_id) REFERENCES public.bank_statements(id);


--
-- Name: bank_reconciliations bank_reconciliations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bank_statement_transactions bank_statement_transactions_bank_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_statement_transactions
    ADD CONSTRAINT bank_statement_transactions_bank_statement_id_fkey FOREIGN KEY (bank_statement_id) REFERENCES public.bank_statements(id) ON DELETE CASCADE;


--
-- Name: bank_statements bank_statements_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;


--
-- Name: bank_statements bank_statements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: budgets budgets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) NOT VALID;


--
-- Name: budgets budgets_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id);


--
-- Name: budgets budgets_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id);


--
-- Name: company_nacha_settings company_nacha_settings_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.company_nacha_settings
    ADD CONSTRAINT company_nacha_settings_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id);


--
-- Name: custom_report_definitions custom_report_definitions_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.custom_report_definitions
    ADD CONSTRAINT custom_report_definitions_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id);


--
-- Name: entities entities_parent_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_parent_entity_id_fkey FOREIGN KEY (parent_entity_id) REFERENCES public.entities(id);


--
-- Name: bank_accounts fk_bank_accounts_cash_account; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT fk_bank_accounts_cash_account FOREIGN KEY (cash_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id);


--
-- Name: journal_entries journal_entries_target_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_target_entity_id_fkey FOREIGN KEY (target_entity_id) REFERENCES public.entities(id);


--
-- Name: journal_entry_items journal_entry_items_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entry_items
    ADD CONSTRAINT journal_entry_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) NOT VALID;


--
-- Name: journal_entry_items journal_entry_items_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entry_items
    ADD CONSTRAINT journal_entry_items_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id);


--
-- Name: journal_entry_items journal_entry_items_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entry_items
    ADD CONSTRAINT journal_entry_items_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: journal_entry_items journal_entry_items_transfer_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.journal_entry_items
    ADD CONSTRAINT journal_entry_items_transfer_fund_id_fkey FOREIGN KEY (transfer_fund_id) REFERENCES public.funds(id);


--
-- Name: nacha_files nacha_files_payment_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.nacha_files
    ADD CONSTRAINT nacha_files_payment_batch_id_fkey FOREIGN KEY (payment_batch_id) REFERENCES public.payment_batches(id);


--
-- Name: payment_batches payment_batches_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.payment_batches
    ADD CONSTRAINT payment_batches_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id);


--
-- Name: payment_batches payment_batches_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.payment_batches
    ADD CONSTRAINT payment_batches_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id);


--
-- Name: payment_items payment_items_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: payment_items payment_items_payment_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_payment_batch_id_fkey FOREIGN KEY (payment_batch_id) REFERENCES public.payment_batches(id) ON DELETE CASCADE;


--
-- Name: payment_items payment_items_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: npfadmin
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: printed_checks printed_checks_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;


--
-- Name: printed_checks printed_checks_check_format_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_check_format_id_fkey FOREIGN KEY (check_format_id) REFERENCES public.check_formats(id);


--
-- Name: printed_checks printed_checks_cleared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_cleared_by_fkey FOREIGN KEY (cleared_by) REFERENCES public.users(id);


--
-- Name: printed_checks printed_checks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: printed_checks printed_checks_printed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_printed_by_fkey FOREIGN KEY (printed_by) REFERENCES public.users(id);


--
-- Name: printed_checks printed_checks_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: printed_checks printed_checks_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bvasu
--

ALTER TABLE ONLY public.printed_checks
    ADD CONSTRAINT printed_checks_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.users(id);


--
-- Name: FUNCTION accounts_derive_fields(); Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON FUNCTION public.accounts_derive_fields() TO npfadmin;


--
-- Name: FUNCTION accounts_set_updated_at(); Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON FUNCTION public.accounts_set_updated_at() TO npfadmin;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.accounts TO npfadmin;


--
-- Name: TABLE bank_deposit_items; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.bank_deposit_items TO npfadmin;


--
-- Name: TABLE bank_deposits; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.bank_deposits TO npfadmin;


--
-- Name: TABLE bank_reconciliation_adjustments; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.bank_reconciliation_adjustments TO npfadmin;


--
-- Name: TABLE bank_reconciliation_items; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.bank_reconciliation_items TO npfadmin;


--
-- Name: TABLE bank_reconciliations; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.bank_reconciliations TO npfadmin;


--
-- Name: TABLE bank_statement_transactions; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.bank_statement_transactions TO npfadmin;


--
-- Name: TABLE bank_statements; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.bank_statements TO npfadmin;


--
-- Name: TABLE check_formats; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.check_formats TO npfadmin;


--
-- Name: TABLE gl_codes; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.gl_codes TO npfadmin;


--
-- Name: TABLE printed_checks; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.printed_checks TO npfadmin;


--
-- Name: TABLE schema_meta; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.schema_meta TO npfadmin;


--
-- Name: TABLE user_sessions; Type: ACL; Schema: public; Owner: bvasu
--

GRANT ALL ON TABLE public.user_sessions TO npfadmin;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: bvasu
--

ALTER DEFAULT PRIVILEGES FOR ROLE bvasu IN SCHEMA public GRANT ALL ON SEQUENCES TO npfadmin;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: bvasu
--

ALTER DEFAULT PRIVILEGES FOR ROLE bvasu IN SCHEMA public GRANT ALL ON FUNCTIONS TO npfadmin;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: bvasu
--

ALTER DEFAULT PRIVILEGES FOR ROLE bvasu IN SCHEMA public GRANT ALL ON TABLES TO npfadmin;


--
-- PostgreSQL database dump complete
--

\unrestrict 2pLFO5gpiCwQZSlj59CiovqU3qKzF1CzRKdU26tdmTsI6i6fbcJmfgNuFuumEgR

