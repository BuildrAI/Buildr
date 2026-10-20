import type { RepositoryDraft, ServiceDraft } from '../api/asset-catalog-api';
import { normalizeCodeInput } from '../../../lib/code-input.ts';

/** 提交草稿：选择或新增代码库时服务由代码库承载（不带目录语义），否则维持服务目录模式；项目归属始终通过 projectIds 提交。 */
export function serviceCreatePayload(draft: ServiceDraft, options: { newRepository: boolean; repository: RepositoryDraft; projectCode?: string }): ServiceDraft {
  const base: ServiceDraft = serviceCreateDraft(draft, options);
  const usesRepository = options.newRepository || Boolean(draft.repositoryId);
  if (draft.projectIds !== undefined) base.projectIds = [...new Set([options.projectCode, ...draft.projectIds].filter((value): value is string => Boolean(value)))];
  else if (options.projectCode) base.projectIds = [options.projectCode];
  else delete base.projectIds;
  if (usesRepository) {
    delete base.projectCode;
    delete base.directoryMode;
    delete base.directoryPath;
    delete base.directoryObservation;
  }
  if (options.newRepository) {
    base.repository = options.repository;
    delete base.repositoryId;
    delete base.modulePath;
  } else {
    delete base.repository;
    if (usesRepository) base.modulePath = (draft.modulePath || '').trim();
    else {
      delete base.modulePath;
      base.projectCode = options.projectCode || draft.projectCode;
    }
  }
  return base;
}

/** 取消或暂存草稿：只归一输入，不裁剪字段，隐藏区域的选择保留以便重新打开。 */
export function serviceCreateDraft(draft: ServiceDraft, options: { newRepository: boolean; repository: RepositoryDraft; projectCode?: string }): ServiceDraft {
  return { ...draft, name: draft.name.trim(), code: normalizeCodeInput(draft.code.replace(/\s+/g, '')), projectCode: options.projectCode || draft.projectCode, ...(options.newRepository ? { repository: options.repository, repositoryId: undefined } : { repository: undefined }) };
}
