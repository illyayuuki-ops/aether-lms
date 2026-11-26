CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"degree" text DEFAULT '' NOT NULL,
	"year_level" text DEFAULT '1' NOT NULL,
	"computer_number" integer NOT NULL,
	"research_topic" text,
	"login_time" timestamp with time zone DEFAULT now() NOT NULL,
	"logout_time" timestamp with time zone,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_minutes" integer,
	"logout_reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"session_token" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"degree" text DEFAULT '' NOT NULL,
	"major" text,
	"year_level" text DEFAULT '1' NOT NULL,
	"password" text DEFAULT '' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'librarian' NOT NULL,
	"secret_code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "pc_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"pc_number" integer NOT NULL,
	"ip_address" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pc_settings_pc_number_unique" UNIQUE("pc_number")
);
