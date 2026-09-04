WITH selected_report AS (
  SELECT
    r.id,
    r.uuid,
    r.start_time,
    r.end_time,
    c.uuid AS config_uuid
  FROM reports r
  JOIN tasks t ON t.id = r.task
  JOIN configs c ON c.id = t.config
  WHERE r.uuid = :'report_uuid'
    AND r.scan_run_status = 1
    AND r.start_time > 0
    AND r.end_time >= r.start_time
    AND c.uuid = 'daba56c8-73ec-11df-a475-002264764cea'
), protected_results AS (
  SELECT jsonb_build_object(
    'ResultId', x.uuid,
    'Host', x.host,
    'Port', CASE
      WHEN x.port ~ '^[0-9]+/' THEN split_part(x.port, '/', 1)::integer
      ELSE NULL
    END,
    'Transport', CASE lower(split_part(x.port, '/', 2))
      WHEN 'tcp' THEN 'TCP'
      WHEN 'udp' THEN 'UDP'
      ELSE 'OTHER'
    END,
    'NvtOid', NULLIF(x.nvt, ''),
    'Title', COALESCE(NULLIF(n.name, ''), NULLIF(x.type, ''), 'Greenbone result'),
    'Severity', greatest(0, least(10, x.severity::numeric)),
    'QoD', greatest(0, least(100, x.qod)),
    'CVEs', COALESCE((
      SELECT jsonb_agg(DISTINCT upper(vr.ref_id) ORDER BY upper(vr.ref_id))
      FROM vt_refs vr
      WHERE vr.vt_oid = x.nvt
        AND lower(vr.type) = 'cve'
        AND vr.ref_id ~* '^CVE-[0-9]{4}-[0-9]{4,}$'
    ), '[]'::jsonb),
    'Evidence', COALESCE(x.description, '')
  ) AS item
  FROM selected_report sr
  JOIN results x ON x.report = sr.id
  LEFT JOIN nvts n ON n.oid = x.nvt
  WHERE NULLIF(x.uuid, '') IS NOT NULL
    AND NULLIF(x.host, '') IS NOT NULL
)
SELECT jsonb_build_object(
  'SchemaVersion', 1,
  'SourceSystem', 'GREENBONE_READ_ONLY_EXTRACTION',
  'ReportId', sr.uuid,
  'ReportStatus', 'DONE',
  'AuthorizationReference', :'authorization_reference',
  'GeneratedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'ScanStartedAt', to_char(to_timestamp(sr.start_time) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'ScanCompletedAt', to_char(to_timestamp(sr.end_time) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'ScanProfile', 'VULNERABILITY_SAFE',
  'Results', COALESCE((SELECT jsonb_agg(item ORDER BY item->>'ResultId') FROM protected_results), '[]'::jsonb)
)
FROM selected_report sr;
