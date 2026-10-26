\pset pager off
WITH raw AS (
  SELECT h.t_xmin, h.t_xmax, h.t_ctid, h.t_attrs
  FROM generate_series(
         0,
         (pg_relation_size('nfe_lines') / current_setting('block_size')::int) - 1
       ) AS g(blk)
  CROSS JOIN LATERAL heap_page_item_attrs(
         get_raw_page('nfe_lines', g.blk),
         'nfe_lines'::regclass,
         false
       ) AS h
  WHERE h.lp_len > 0
)
SELECT t_xmin::text::bigint AS xmin,
       t_xmax::text::bigint AS xmax,
       convert_from(substring(t_attrs[2] from 2), 'UTF8') AS company_id,
       convert_from(substring(t_attrs[3] from 2), 'UTF8') AS competencia,
       convert_from(substring(t_attrs[5] from 2), 'UTF8') AS tipo,
       count(*) AS rows
FROM raw
WHERE t_xmax <> 0
  AND convert_from(substring(t_attrs[2] from 2), 'UTF8') = 'baifer'
GROUP BY 1,2,3,4,5
ORDER BY 4,5,1,2;
