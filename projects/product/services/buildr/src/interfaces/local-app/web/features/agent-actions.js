const ACTION_LABELS = {
  workspace: '工作空间',
  project: '项目',
  service: '服务',
  start: '任务',
  change: '变更',
  'task-review': '任务审查',
};

export function setupAgentActions({ api }) {
  const drawer = document.getElementById('agent-action-drawer');
  const backdrop = document.getElementById('agent-action-backdrop');
  const content = document.getElementById('agent-action-content');

  function setOpen(open) {
    drawer.classList.toggle('hidden', !open);
    backdrop.classList.toggle('hidden', !open);
    drawer.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('drawer-open', open);
  }

  function formHeader(noun, action = '创建') {
    const copy = action === '创建' ? `先描述你的意图，再生成交给 Agent 的指令。复制指令不代表${noun}已经创建。` : `选择已登记范围并描述目标。Buildr 只完成交接，不会在页面内${action}任务。`;
    return `<div class="form-header"><button class="text-button" type="button" data-back>← 返回</button><span>${action}${noun}</span></div><p class="drawer-copy">${copy}</p><div id="agent-action-error" class="alert error hidden" role="alert"></div>`;
  }

  function renderChooser(context = {}) {
    content.innerHTML = `
      <p class="drawer-copy">Buildr 帮你确认工作范围并生成受约束指令；真正的创建、迁移和专业执行仍由 Agent 完成。</p>
      <div class="action-choice-grid">
        <button class="action-choice" type="button" data-action="start"><span class="action-symbol">→</span><span><strong>用 Agent 开始</strong><small>选择项目、可选服务，并描述第一项工作</small></span><span>→</span></button>
        <button class="action-choice" type="button" data-action="workspace"><span class="action-symbol">⌂</span><span><strong>创建工作空间</strong><small>建立一个共同工作的顶层目录</small></span><span>→</span></button>
        <button class="action-choice" type="button" data-action="project"><span class="action-symbol">◇</span><span><strong>创建项目</strong><small>登记业务、产品、系统或长期工作</small></span><span>→</span></button>
        <button class="action-choice" type="button" data-action="service"><span class="action-symbol">◫</span><span><strong>接入服务</strong><small>按需接入代码仓、应用、模块或可执行资产</small></span><span>→</span></button>
        <button class="action-choice secondary-choice" type="button" data-action="change"><span class="action-symbol">△</span><span><strong>创建变更</strong><small>建立 OpenSpec 变更契约</small></span><span>→</span></button>
      </div>`;
    for (const button of content.querySelectorAll('[data-action]')) button.addEventListener('click', () => open(button.dataset.action, context));
  }

  function value(id) { return document.getElementById(id)?.value || ''; }

  function bindForm(action, generate, unchangedState = '') {
    content.querySelector('[data-back]')?.addEventListener('click', () => renderChooser());
    document.getElementById('agent-action-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('agent-action-error');
      errorBox.classList.add('hidden');
      try {
        const result = await generate();
        const noun = ACTION_LABELS[action];
        document.getElementById('agent-action-result')?.remove();
        const state = unchangedState || `${noun}尚未创建。`;
        content.insertAdjacentHTML('beforeend', `<div id="agent-action-result" class="prompt-result"><label>可复制指令<textarea id="action-prompt-output" rows="13" readonly></textarea></label><div class="copy-row"><button id="copy-action-prompt" class="button secondary" type="button">复制指令</button><span id="action-copy-state">${state}</span></div></div>`);
        document.getElementById('action-prompt-output').value = result.prompt;
        document.getElementById('copy-action-prompt').addEventListener('click', () => copyPrompt(noun, unchangedState || '任务尚未在 Buildr App 中开始或完成。'));
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove('hidden');
      }
    });
  }

  async function copyPrompt(noun, unchangedState = '') {
    const output = document.getElementById('action-prompt-output');
    try {
      await navigator.clipboard.writeText(output.value);
      document.getElementById('action-copy-state').textContent = `指令已复制。${unchangedState || `${noun}尚未创建。`}`;
    } catch {
      output.select();
      document.getElementById('action-copy-state').textContent = `已选中指令，请手动复制。${unchangedState || `${noun}尚未创建。`}`;
    }
  }

  function renderWorkspaceForm() {
    content.innerHTML = `${formHeader('工作空间')}<form id="agent-action-form"><label>名称<input id="action-name" autocomplete="off" required></label><label>目标位置（可选）<input id="action-target" autocomplete="off" placeholder="不确定时留空，由 Agent 询问"></label><label>说明<textarea id="action-description" rows="5" required></textarea></label><div class="actions"><button class="button primary" type="submit">生成工作空间指令</button></div></form>`;
    bindForm('workspace', () => api('/api/v1/prompts/workspace-create', { method: 'POST', body: JSON.stringify({ name: value('action-name'), description: value('action-description'), targetPath: value('action-target') }) }));
  }

  function renderProvidedPrompt(prompt, title = '处理工作空间') {
    content.innerHTML = `${formHeader('工作空间', title)}<div id="agent-action-result" class="prompt-result"><label>可复制指令<textarea id="action-prompt-output" rows="13" readonly></textarea></label><div class="copy-row"><button id="copy-action-prompt" class="button secondary" type="button">复制指令</button><span id="action-copy-state">目录尚未被初始化、迁移或登记。</span></div></div>`;
    document.getElementById('action-prompt-output').value = prompt;
    document.getElementById('copy-action-prompt').addEventListener('click', () => copyPrompt('工作空间', '目录尚未被初始化、迁移或登记。'));
    content.querySelector('[data-back]').addEventListener('click', () => renderChooser());
  }

  function renderProjectForm() {
    content.innerHTML = `${formHeader('项目')}<form id="agent-action-form" class="prompt-grid"><label>名称<input id="action-name" autocomplete="off" required></label><label class="full">用途或长期目标<textarea id="action-description" rows="4" required placeholder="例如：管理支付产品的需求、设计和服务关系"></textarea></label><details class="full"><summary>补充已有目录或 Git 声明（可选）</summary><div class="prompt-grid advanced-fields"><label>代码（可选）<input id="action-code" autocomplete="off" placeholder="不确定时由 Agent 提议"></label><label>来源<select id="action-source"><option value="workspace">当前工作空间</option><option value="git">独立 Git 仓库</option></select></label><label>Git 地址（可选）<input id="action-git-url" autocomplete="off"></label><label>远端名称（可选）<input id="action-remote" autocomplete="off" placeholder="origin"></label><label>集成分支（可选）<input id="action-branch" autocomplete="off"></label></div></details><div class="actions full"><button class="button primary" type="submit">生成项目指令</button></div></form>`;
    bindForm('project', () => api('/api/v1/prompts/project-create', { method: 'POST', body: JSON.stringify({ code: value('action-code'), name: value('action-name'), description: value('action-description'), sourceType: value('action-source'), gitUrl: value('action-git-url'), remote: value('action-remote'), integrationBranch: value('action-branch') }) }));
  }

  async function renderServiceForm(context) {
    content.innerHTML = `${formHeader('服务')}<form id="agent-action-form" class="prompt-grid"><label>所属项目<select id="action-project" required><option value="">正在读取已登记项目…</option></select></label><label>名称<input id="action-name" autocomplete="off" required></label><label class="full">用途<textarea id="action-description" rows="4" required placeholder="例如：支付 API、管理后台或可执行任务"></textarea></label><details class="full"><summary>补充代码仓或技术声明（可选）</summary><div class="prompt-grid advanced-fields"><label>代码（可选）<input id="action-code" autocomplete="off"></label><label>类型（可选）<input id="action-type" autocomplete="off"></label><label>来源<select id="action-source"><option value="local">本地目录</option><option value="git">Git 仓库</option></select></label><label>本地目录（可选）<input id="action-local-path" autocomplete="off"></label><label>Git 地址（可选）<input id="action-git-url" autocomplete="off"></label><label>远端名称（可选）<input id="action-remote" autocomplete="off" placeholder="origin"></label><label>集成分支（可选）<input id="action-branch" autocomplete="off"></label></div></details><div class="actions full"><button class="button primary" type="submit">生成服务指令</button></div></form>`;
    try {
      const projects = await api('/api/v1/projects');
      const select = document.getElementById('action-project');
      select.replaceChildren();
      for (const project of projects.projects) {
        const option = document.createElement('option'); option.value = project.code; option.textContent = `${project.name}（${project.code}）`; select.append(option);
      }
      if (context.projectCode && projects.projects.some((project) => project.code === context.projectCode)) select.value = context.projectCode;
      if (!projects.projects.length) { const option = document.createElement('option'); option.textContent = '请先创建项目'; option.value = ''; select.append(option); }
    } catch (error) {
      document.getElementById('agent-action-error').textContent = error.message;
      document.getElementById('agent-action-error').classList.remove('hidden');
    }
    bindForm('service', () => api('/api/v1/prompts/service-create', { method: 'POST', body: JSON.stringify({ projectCode: value('action-project'), code: value('action-code'), name: value('action-name'), description: value('action-description'), type: value('action-type'), sourceType: value('action-source'), localPath: value('action-local-path'), gitUrl: value('action-git-url'), remote: value('action-remote'), integrationBranch: value('action-branch') }) }));
  }

  async function renderStartWorkForm(context) {
    content.innerHTML = `${formHeader('第一项工作', '开始')}<form id="agent-action-form" class="prompt-grid"><label>项目<select id="action-project" required><option value="">正在读取范围…</option></select></label><label>服务（可选）<select id="action-service"><option value="">本次不限定服务</option></select></label><label class="full">你想推进什么？<textarea id="action-goal" rows="5" required placeholder="例如：梳理支付项目当前状态，并提出下一步实现方案"></textarea></label><div class="actions full"><button class="button primary" type="submit">生成开始工作指令</button></div></form>`;
    const projectSelect = document.getElementById('action-project');
    const serviceSelect = document.getElementById('action-service');
    async function loadServices(projectCode) {
      serviceSelect.replaceChildren(new Option('本次不限定服务', ''));
      if (!projectCode) return;
      const data = await api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services`);
      for (const service of data.services) serviceSelect.append(new Option(`${service.name}（${service.code}）`, service.code));
    }
    try {
      const projects = await api('/api/v1/projects');
      projectSelect.replaceChildren();
      for (const project of projects.projects) projectSelect.append(new Option(`${project.name}（${project.code}）`, project.code));
      if (context.projectCode && projects.projects.some((project) => project.code === context.projectCode)) projectSelect.value = context.projectCode;
      await loadServices(projectSelect.value);
      projectSelect.addEventListener('change', () => loadServices(projectSelect.value));
    } catch (error) {
      document.getElementById('agent-action-error').textContent = error.message;
      document.getElementById('agent-action-error').classList.remove('hidden');
    }
    bindForm('start', () => api('/api/v1/prompts/start-work', { method: 'POST', body: JSON.stringify({ projectCode: value('action-project'), serviceCode: value('action-service'), goal: value('action-goal') }) }), '任务尚未在 Buildr App 中开始或完成。');
  }

  async function renderChangeForm(context) {
    if (context.ref && context.action) {
      const actionLabel = context.action === 'review' ? '审查' : '继续推进';
      content.innerHTML = `${formHeader('变更', actionLabel)}<form id="agent-action-form"><div class="context-help">${actionLabel}项目 <strong>${context.projectCode}</strong> 中的变更。Buildr 只生成指令，不直接修改变更文件。</div><div class="actions"><button class="button primary" type="submit">生成${actionLabel}指令</button></div></form>`;
      bindForm('change', () => api('/api/v1/prompts/change-action', { method: 'POST', body: JSON.stringify({ projectCode: context.projectCode, ref: context.ref, action: context.action }) }), '变更文件未被修改。');
      return;
    }
    content.innerHTML = `${formHeader('变更')}<form id="agent-action-form"><label>所属项目<select id="action-project" required><option value="">正在读取已登记项目…</option></select></label><label>变更目标<textarea id="action-goal" rows="6" required placeholder="描述要解决的问题、期望结果与重要边界"></textarea></label><div class="actions"><button class="button primary" type="submit">生成变更指令</button></div></form>`;
    const form = document.getElementById('agent-action-form');
    const select = document.getElementById('action-project');
    const errorBox = document.getElementById('agent-action-error');
    const isCurrentForm = () => form.isConnected && document.getElementById('agent-action-form') === form;
    bindForm('change', () => api('/api/v1/prompts/change-create', { method: 'POST', body: JSON.stringify({ projectCode: value('action-project'), goal: value('action-goal') }) }));
    try {
      const projects = await api('/api/v1/projects');
      if (!isCurrentForm()) return;
      select.replaceChildren();
      for (const project of projects.projects) {
        const option = document.createElement('option');
        option.value = project.code;
        option.textContent = `${project.name}（${project.code}）`;
        select.append(option);
      }
      if (context.projectCode && projects.projects.some((project) => project.code === context.projectCode)) select.value = context.projectCode;
      if (!projects.projects.length) {
        const option = document.createElement('option');
        option.textContent = '请先创建项目';
        option.value = '';
        select.append(option);
      }
    } catch (error) {
      if (!isCurrentForm()) return;
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  }

  function renderTaskReviewForm(context) {
    const reviewType = context.reviewType === 'completion' ? 'completion' : 'planning';
    const typeLabel = reviewType === 'planning' ? 'Planning Review' : 'Completion Review';
    const change = context.projectCode && context.change ? `${context.projectCode}/${context.change}` : '';
    content.innerHTML = `${formHeader('任务审查', '准备')}<form id="agent-action-form"><div class="context-help">为正式 Task <strong>${context.taskId}</strong> 准备 ${typeLabel}${change ? `，限定 Task-scoped Change <strong>${change}</strong>` : ''}。Buildr 只生成受约束指令，不在页面内执行审查或写入 Result。</div><div class="actions"><button class="button primary" type="submit">生成审查指令</button></div></form>`;
    bindForm('task-review', () => api('/api/v1/prompts/task-review', { method: 'POST', body: JSON.stringify({ taskId: context.taskId, reviewType, ...(change ? { projectCode: context.projectCode, change: context.change } : {}) }) }), 'Review Result 尚未记录。');
  }

  function open(action, context = {}) {
    if (action === 'workspace') renderWorkspaceForm();
    else if (action === 'workspace-recovery') renderProvidedPrompt(context.prompt);
    else if (action === 'project') renderProjectForm();
    else if (action === 'service') void renderServiceForm(context);
    else if (action === 'start') void renderStartWorkForm(context);
    else if (action === 'change') void renderChangeForm(context);
    else if (action === 'task-review') renderTaskReviewForm(context);
    else renderChooser(context);
    setOpen(true);
    content.querySelector('input, button')?.focus();
  }

  document.getElementById('open-agent-action').addEventListener('click', () => open());
  document.getElementById('close-agent-action').addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
  return { open };
}
