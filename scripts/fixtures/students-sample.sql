-- Sanitized sample of the students table, used by `pnpm db:seed` and tests.
-- All names/IDs below are fictional. Never commit real student data.

COPY public.students (id, student_id, name, degree, major, year_level, password, must_change_password, is_active, created_at, updated_at) FROM stdin;
1	24-00001	SAMPLE, ALPHA A.	BSIT	\N	1	24-00001	f	t	2026-01-01 00:00:00+00	2026-01-01 00:00:00+00
2	24-00002	SAMPLE, BRAVO B.	BSED	ENG	1	24-00002	f	t	2026-01-01 00:00:00+00	2026-01-01 00:00:00+00
3	24-00003	SAMPLE, CHARLIE C.	BSHM	\N	2	24-00003	f	t	2026-01-01 00:00:00+00	2026-01-01 00:00:00+00
\.
