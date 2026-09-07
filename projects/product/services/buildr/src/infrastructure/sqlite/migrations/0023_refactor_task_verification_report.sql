CREATE TABLE task_verification_current_next (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  result_json TEXT NOT NULL CHECK (
    json_valid(result_json)
    AND json_extract(result_json, '$.schemaVersion') = 'buildr.task-verification-report/v1'
    AND json_extract(result_json, '$.taskId') = task_id
  ),
  target_identity TEXT NOT NULL CHECK (trim(target_identity) <> ''),
  outcome TEXT NOT NULL CHECK (outcome IN ('passed', 'not-passed', 'incomplete')),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL)
) STRICT, WITHOUT ROWID;

INSERT INTO task_verification_current_next(task_id, result_json, target_identity, outcome, updated_at)
SELECT current.task_id,
  json_object(
    'schemaVersion', 'buildr.task-verification-report/v1',
    'taskId', current.task_id,
    'scope', json_object(
      'projects', COALESCE((SELECT json_group_array(project) FROM (SELECT project FROM task_projects WHERE task_id = current.task_id ORDER BY project)), json('[]')),
      'services', COALESCE((SELECT json_group_array(json_object('project', project, 'service', service)) FROM (SELECT project, service FROM task_services WHERE task_id = current.task_id ORDER BY project, service)), json('[]'))
    ),
    'content', json_object(
      'identity', json_extract(current.result_json, '$.target.identity'),
      'summary', json_extract(current.result_json, '$.target.summary')
    ),
    'declarations', COALESCE((
      SELECT json_group_array(json_object(
        'project', json_extract(item.value, '$.project'),
        'path', json_extract(item.value, '$.path'),
        'identity', json_extract(item.value, '$.identity'),
        'status', 'invalid',
        'summary', '历史声明不是v4测试地图，需按当前项目事实重新确认。'
      ))
      FROM json_each(current.result_json, '$.declarations') AS item
    ), json('[]')),
    'checks', COALESCE((
      SELECT json_group_array(json_object(
        'id', json_extract(item.value, '$.project') || '/' || json_extract(item.value, '$.capability'),
        'project', json_extract(item.value, '$.project'),
        'testing', json_extract(item.value, '$.capability'),
        'selection', 'legacy',
        'targets', json_array(json_extract(item.value, '$.capability')),
        'source', 'legacy',
        'outcome', json_extract(item.value, '$.outcome'),
        'summary', COALESCE(json_extract(item.value, '$.facts[0]'), '历史验证能力结果'),
        'mapStatus', 'map-unavailable'
      ))
      FROM json_each(current.result_json, '$.capabilities') AS item
    ), json('[]')),
    'gaps', CASE
      WHEN NOT EXISTS (SELECT 1 FROM json_each(current.result_json, '$.capabilities') AS item WHERE json_extract(item.value, '$.outcome') = 'failed')
        AND (json_extract(current.result_json, '$.conclusion.outcome') <> 'passed' OR NOT EXISTS (SELECT 1 FROM json_each(current.result_json, '$.capabilities')))
        AND NOT EXISTS (SELECT 1 FROM json_each(current.result_json, '$.coverageGaps'))
      THEN json_array(
        json_object('testing', 'legacy-verification-coverage', 'reason', '历史验证结果无法证明完整覆盖。'),
        json_object('testing', 'legacy-verification-map', 'reason', '历史验证结果未绑定v4测试地图。')
      )
      ELSE json_insert(COALESCE((
          SELECT json_group_array(json_object(
            'testing', json_extract(item.value, '$.scope'),
            'reason', json_extract(item.value, '$.summary')
          ))
          FROM json_each(current.result_json, '$.coverageGaps') AS item
        ), json('[]')), '$[#]', json_object('testing', 'legacy-verification-map', 'reason', '历史验证结果未绑定v4测试地图。'))
    END,
    'conclusion', json_object(
      'outcome', CASE
        WHEN EXISTS (SELECT 1 FROM json_each(current.result_json, '$.capabilities') AS item WHERE json_extract(item.value, '$.outcome') = 'failed') THEN 'not-passed'
        WHEN json_extract(current.result_json, '$.conclusion.outcome') = 'passed' AND EXISTS (SELECT 1 FROM json_each(current.result_json, '$.capabilities')) THEN 'passed'
        ELSE 'incomplete'
      END,
      'summary', COALESCE(json_extract(current.result_json, '$.conclusion.summary'), '历史验证结果迁移')
    ),
    'completedAt', json_extract(current.result_json, '$.completedAt')
  ),
  json_extract(current.result_json, '$.target.identity'),
  CASE
    WHEN EXISTS (SELECT 1 FROM json_each(current.result_json, '$.capabilities') AS item WHERE json_extract(item.value, '$.outcome') = 'failed') THEN 'not-passed'
    WHEN json_extract(current.result_json, '$.conclusion.outcome') = 'passed' AND EXISTS (SELECT 1 FROM json_each(current.result_json, '$.capabilities')) THEN 'passed'
    ELSE 'incomplete'
  END,
  json_extract(current.result_json, '$.completedAt')
FROM task_verification_current AS current;

DROP TABLE task_verification_current;
ALTER TABLE task_verification_current_next RENAME TO task_verification_current;
CREATE INDEX task_verification_current_target_idx
  ON task_verification_current(target_identity, updated_at DESC, task_id);
