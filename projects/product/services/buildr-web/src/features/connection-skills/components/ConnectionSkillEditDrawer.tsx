import { Alert, Button, Checkbox, Collapse, Input } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import type { ConnectionSkillsClient } from '../api/connection-skills-api';
import type { CatalogEntry, ConnectionInstance } from '../connection-skill-types';
import { authenticationLabel, authorizationAccountLabel, categoryLabel, connectionEnvironmentHidden, draftHookInput } from '../connection-skill-form';
import { useConnectionSkillEditor } from '../useConnectionSkillEditor';
import { ConnectionHookResult } from './ConnectionHookResult';
import { ConnectionPersonalAuthentication } from './ConnectionPersonalAuthentication';
import { ConnectionSystemPicker } from './ConnectionSystemPicker';
import { ConnectionTeamForm } from './ConnectionTeamForm';
import { ConnectionSavedPersonalSecrets } from './ConnectionSavedPersonalSecrets';
import { ConnectionBrowserAuthorization } from './ConnectionBrowserAuthorization';

type Props = { instance?: ConnectionInstance; definitions: CatalogEntry[]; client: ConnectionSkillsClient; onClose(): void; onSaved(saved: ConnectionInstance): void };

export function ConnectionSkillEditDrawer({ instance: initial, definitions, client, onClose, onSaved }: Props) {
  const editor = useConnectionSkillEditor({ instance: initial, definitions, client, onSaved, onTeamSaved: onClose });
  const { instance, entry, disabled, ready, personalOnly, personalAllowed, authorizationMethod } = editor;
  const picking = !entry && !instance;
  const authFields = entry?.definition.authentication.fields || [];
  const systemName = entry?.definition.name || instance?.binding.definitionId || '';
  const primarySource = personalOnly ? 'personal' : 'team';
  const hideEnvironment = connectionEnvironmentHidden(entry);
  const savedSecrets = !authorizationMethod && personalAllowed && instance && entry && <ConnectionSavedPersonalSecrets key={editor.secretEpoch} fields={authFields} instance={instance} client={client} disabled={disabled || editor.conflict} onConflict={editor.reportAuthenticationConflict} />;
  const close = () => { if (!editor.saving) { editor.close(); onClose(); } };
  const discoveryReady = Object.fromEntries(Object.entries(entry?.definition.hooks || {}).map(([name]) => {
    try {
      if (!entry || !personalOnly && editor.teamIntent === 'remove') return [name, false];
      const intent = personalOnly ? editor.personalIntent : editor.teamIntent === 'keep' ? 'keep' : 'replace';
      draftHookInput(entry, instance, editor.config, { source: primarySource, intent, ...(intent === 'replace' ? { values: personalOnly ? editor.personalValues : editor.teamValues } : {}) }, name);
      return [name, editor.hookReady(name)];
    } catch { return [name, false]; }
  }));
  return <DrawerShell open eyebrow={initial ? '编辑连接' : '新增连接'} title={picking ? '选择连接系统' : instance ? `${systemName} · ${instance.name}` : `连接 ${systemName}`} sub={entry ? entry.definition.presentation?.categoryLabel || categoryLabel(entry.definition.category) : undefined} width="min(680px, 100vw)" onClose={close} closeDisabled={Boolean(editor.saving)} maskClosable={!editor.saving} keyboard={!editor.saving} rootClassName="buildr-connection-skill-drawer" footer={<div className="buildr-connection-skill-footer-shell">{editor.notice && <p id="connection-skill-save-notice" role="status" className="buildr-connection-skill-footer-notice">{editor.notice}</p>}<div className="buildr-connection-skill-footer"><Button id="close-connection-skill-editor" disabled={Boolean(editor.saving)} onClick={close}>取消</Button>{!picking && <div className="buildr-connection-skill-footer-actions"><Button id="test-connection-skill" disabled={!ready || !entry?.definition.hooks?.test || Boolean(authorizationMethod && !instance?.authentication.personal.configured)} loading={editor.testing === primarySource} onClick={() => void editor.runHook()}>测试连接</Button><Button id="save-connection-skill-team" type="primary" loading={editor.saving === 'team'} disabled={disabled || !entry || editor.conflict || personalOnly && Boolean(instance?.authentication.team.present)} onClick={() => void editor.saveTeam()}>保存</Button></div>}</div></div>}>
    <div className="buildr-connection-skill-editor" id="connection-skill-editor">
      {picking ? <ConnectionSystemPicker entries={definitions} disabled={disabled} onSelect={editor.chooseDefinition} /> : <>
        {!instance && <Button id="change-connection-system" type="text" className="buildr-connection-change-system" icon={<ArrowLeftOutlined />} disabled={disabled} onClick={editor.resetDefinition}>重新选择连接系统</Button>}
        {!entry && <Alert type="warning" showIcon message="接入方式当前不可用" description="连接配置已保留，请检查接入来源是否已安装并启用。" />}
        {entry?.diagnostics.map((item, index) => <Alert key={index} showIcon type="warning" message={item.message} />)}
        {instance?.availability.diagnostics.length ? <details className="buildr-connection-availability"><summary>此连接暂不可运行 · 查看原因</summary>{instance.availability.diagnostics.map((item, index) => <p key={index}>{item}</p>)}</details> : null}
        <section className={`buildr-connection-skill-identity${hideEnvironment ? ' is-environment-hidden' : ''}`} aria-label={hideEnvironment ? '连接名称' : '连接名称和环境'}><label htmlFor="connection-skill-name">连接名称<Input id="connection-skill-name" disabled={disabled} value={editor.name} placeholder={hideEnvironment ? systemName : `${systemName} 测试环境`} onChange={event => editor.setName(event.target.value)} /></label>{!hideEnvironment && <label htmlFor="connection-skill-environment">环境 · 可选<Input id="connection-skill-environment" disabled={disabled} value={editor.environment} placeholder="例如：测试、回归、生产" onChange={event => editor.setEnvironment(event.target.value)} /></label>}</section>
        {personalOnly && instance?.authentication.team.present && <Alert id="connection-skill-legacy-team-auth" type="warning" showIcon message="检测到旧版共享认证" description="先将完整账号迁移并加密保存在本机，再移除原共享认证。此操作不会调用外部系统。" action={<Button id="migrate-connection-skill-personal" disabled={disabled || !entry || editor.conflict} loading={editor.saving === 'personal'} onClick={() => void editor.migratePersonal()}>迁移为本机个人账号</Button>} />}
        {personalOnly && <p className="buildr-connection-skill-muted" id="connection-skill-personal-only">此系统仅使用本机个人账号；外部系统按当前账号决定可访问范围和操作权限。</p>}
        {entry && <ConnectionTeamForm entry={entry} instance={instance} config={editor.config} fieldLabels={editor.fieldLabels} authentication={personalOnly ? editor.personalValues : editor.teamValues} intent={personalOnly ? editor.personalIntent : editor.teamIntent} authenticationSource={primarySource} showAuthentication={!authorizationMethod} savedSecrets={personalOnly ? savedSecrets : undefined} disabled={disabled} options={editor.options} discovering={editor.discovering} discoveryResults={editor.discoveryResults} discoveryReady={discoveryReady} onConfig={editor.changeConfig} onAuthentication={personalOnly ? editor.changePersonal : editor.changeTeam} onIntent={personalOnly ? intent => intent === 'keep' ? editor.keepPersonal() : editor.replacePersonal() : editor.changeTeamIntent} onDiscover={hook => void editor.runHook(hook)} />}
        {entry && authorizationMethod && <ConnectionBrowserAuthorization entry={entry} instance={instance} disabled={disabled} conflict={editor.conflict} dirty={editor.configurationDirty} authorizing={editor.authorizing} onAuthorize={() => void editor.authorize()} onCancel={editor.cancelAuthorization} />}
        {instance?.authentication[primarySource].diagnostic && <Alert type="warning" showIcon message={instance.authentication[primarySource].diagnostic} />}
        {!personalOnly && editor.teamIntent === 'remove' && <Alert type="warning" showIcon message="下次保存将移除团队账号。" action={<Button size="small" onClick={() => editor.changeTeamIntent(instance?.authentication.team.configured ? 'keep' : 'replace')}>撤销</Button>} />}
        <div className="buildr-connection-test-area"><small className="buildr-connection-skill-muted" id="connection-skill-candidate-source">测试使用{personalOnly ? '本机个人' : '团队'}账号，不会保存当前修改。</small><ConnectionHookResult result={personalOnly ? editor.personalTestResult : editor.testResult} stale={personalOnly ? editor.personalTestStale : editor.testStale} saved={Boolean(instance)} personal={personalOnly} /></div>
        {!authorizationMethod && !personalOnly && personalAllowed && (authFields.length > 0 || instance?.authentication.personal.present) && <ConnectionPersonalAuthentication entry={entry} instance={instance} config={editor.config} enabled={editor.personalEnabled} intent={editor.personalIntent} values={editor.personalValues} disabled={disabled} conflict={editor.conflict} ready={ready} saving={editor.saving === 'personal'} testing={editor.testing === 'personal'} result={editor.personalTestResult} stale={editor.personalTestStale} savedSecrets={savedSecrets} onEnabled={editor.setPersonalEnabled} onChange={editor.changePersonal} onReplace={editor.replacePersonal} onSave={() => void editor.savePersonal()} onTest={() => void editor.runHook(undefined, 'personal')} />}
        {!personalAllowed && instance?.authentication.personal.present && <Alert id="connection-skill-unsupported-personal" type="warning" showIcon message="此接入方式不再支持个人认证" description="遗留个人账号不会自动切换为团队账号；移除后使用已配置的团队账号。" action={<Button id="remove-connection-skill-unsupported-personal" disabled={disabled || editor.conflict} loading={editor.saving === 'personal'} onClick={() => void editor.savePersonal(true)}>移除遗留个人账号</Button>} />}
        <Collapse ghost className="buildr-connection-details-collapse" items={[{ key: 'source', label: '接入详情', children: <div className="buildr-connection-details">
          <dl><dt>接入方式</dt><dd>{entry?.definition.presentation?.methodLabel || entry?.skill.id || instance?.binding.skillAssetIdentity}</dd><dt>来源</dt><dd>{entry?.skill.sourceIdentity || instance?.binding.sourceIdentity}</dd><dt>配置文件</dt><dd>{instance?.sourcePath || '保存后生成团队配置文件'}</dd>{instance && <><dt>当前生效账号</dt><dd>{authorizationMethod ? instance.authentication.personal.configured ? `本机已授权${authorizationAccountLabel(entry, instance) ? ` · ${authorizationAccountLabel(entry, instance)}` : ''}` : '尚未授权' : <>{instance.authentication.source === 'personal' ? '本机个人账号' : '团队账号'} · {authenticationLabel(authFields, instance.authentication[instance.authentication.source].values)}</>}</dd></>}</dl>
          <p className="buildr-connection-skill-muted">{personalOnly ? '连接配置随团队文件共享；个人账号加密保存在本机 .buildr/ 下，不提交到 Git。' : '连接配置和团队账号随团队文件共享；个人账号仅保存在本机。'}</p>
          {entry && <div aria-label="本机程序接收方">{Object.entries(entry.programRecipients || {}).map(([id, receiver]) => <div key={id}><strong>{id}</strong><p>{receiver.executable || '本机尚未找到程序或运行依赖'}</p>{receiver.entry && receiver.entry !== receiver.executable && <p>{receiver.entry}</p>}{instance?.programAvailability?.[id]?.diagnostics.map((item, index) => <small key={index}>{item}</small>)}</div>)}</div>}
          <Checkbox id="connection-skill-enabled" checked={editor.enabled} disabled={disabled} onChange={event => editor.setEnabled(event.target.checked)}>启用此连接</Checkbox>
          {instance && <><Button id="check-connection-skill-program" disabled={disabled} loading={editor.checking} onClick={() => void editor.checkProgram()}>检查程序与依赖</Button>{editor.programCheck && <Alert id="connection-skill-program-result" type={editor.programCheck.ready ? 'success' : 'warning'} showIcon message={editor.programCheck.ready ? '本机程序与依赖可用' : '本机程序或依赖不可用'} description={[...editor.programCheck.diagnostics, editor.programCheck.installHint].filter(Boolean).join('；')} />}</>}
          {!personalOnly && instance?.authentication.team.configured && editor.teamIntent !== 'remove' && <Button id="remove-connection-skill-team" type="link" danger disabled={disabled || !entry} onClick={() => editor.changeTeamIntent('remove')}>移除团队账号</Button>}
          {personalOnly && instance?.authentication.personal.present && <Button id="remove-connection-skill-personal" type="link" danger disabled={disabled || !entry || editor.conflict} loading={editor.saving === 'personal'} onClick={() => void editor.savePersonal(true)}>移除本机个人账号</Button>}
        </div> }]} />
        {editor.error && <Alert id="connection-skill-error" type="error" showIcon message={editor.error} description={editor.conflict ? '草稿已保留，请重新读取当前配置并核对后再保存。' : undefined} />}
        {editor.conflict && <Button id="reread-connection-skill" loading={editor.reading} onClick={() => void editor.reread()}>重新读取当前配置</Button>}
      </>}
    </div>
  </DrawerShell>;
}
