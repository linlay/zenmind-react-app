import { appendComposerDraft, createComposerDraft, serializeComposerDraft } from '../../src/features/chatPersistence/chatComposerDraft.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldApplyChatDetailAsyncResult } from '../../src/features/chatPersistence/chatDetailAsyncScope.ts';

test('async result guard only applies when conversation and request id still match', () => {
  assert.equal(
    shouldApplyChatDetailAsyncResult({
      activeConversationId: 'chat-1',
      targetConversationId: 'chat-1',
      currentRequestId: 3,
      requestId: 3,
    }),
    true
  );
  assert.equal(
    shouldApplyChatDetailAsyncResult({
      activeConversationId: 'chat-2',
      targetConversationId: 'chat-1',
      currentRequestId: 3,
      requestId: 3,
    }),
    false
  );
  assert.equal(
    shouldApplyChatDetailAsyncResult({
      activeConversationId: 'chat-1',
      targetConversationId: 'chat-1',
      currentRequestId: 4,
      requestId: 3,
    }),
    false
  );
});

// Execute the actual controller callbacks with their local dependencies, without mounting navigation/native UI.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const controller = ts.createSourceFile('controller.ts', readFileSync(new URL('../../src/features/chatPersistence/useChatDetailConversationController.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function callback(name: string, scope: Record<string, unknown>) {
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(controller) === name && node.initializer && ts.isCallExpression(node.initializer)) expression = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(controller);
  assert.ok(expression);
  return vm.runInNewContext(ts.transpileModule(`(${expression.getText(controller)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { appendComposerDraft, createComposerDraft, serializeComposerDraft, composerDraft: createComposerDraft(String(scope.draft || 'question')), setComposerDraft() {}, ...scope }) as (...args: unknown[]) => Promise<void>;
}

test('queue controller clears only admitted input and preserves draft on capacity rejection', async () => {
  for (const capacity of [false, true]) {
    let draft = 'submitted', attachments = ['old'], error = '';
    const scope = {
      conversationId: 'chat', draft, readyAttachments: [{ attachmentId: 'old' }], selectedSkills: ['pdf'],
      steerAvailable: true, hasUploadingAttachments: false, hasFailedAttachments: false,
      setErrorText: (value: string) => { error = value; },
      setDraft: (value: string) => { draft = value; },
      handleRemoveAttachment: (id: string) => { attachments = attachments.filter(item => item !== id); },
      chatSyncService: {
        queueSteerConversation: (_id: string, message: string, _files: unknown[], skills: string[], options: { draft: unknown }) => {
          assert.equal(message, 'submitted'); assert.equal(skills[0], 'pdf'); assert.ok(options.draft);
          if (capacity) throw new Error('capacity');
        },
        submitPendingSteer: () => assert.fail('sending input must only queue')
      }
    };
    await callback('handleQueueSteer', scope)();
    assert.equal(draft, capacity ? 'submitted' : '');
    assert.deepEqual(attachments, capacity ? ['old'] : []);
    if (capacity) assert.match(error, /capacity/); else assert.equal(error, '');
  }
});

test('manual steer submits the selected record and never clears newer input', async () => {
  for (const rejected of [false, true]) {
    let settle!: () => void;
    const promise = callback('handleSteer', {
      conversationId: 'chat', activeConversationIdRef: { current: 'chat' }, sendRequestIdRef: { current: 1 },
      getChatCacheScopeId: () => 'scope', setErrorText() {},
      setDraft: () => assert.fail('must not clear current draft'),
      setComposerDraft: () => assert.fail('must not overwrite current draft'),
      handleRemoveAttachment: () => assert.fail('must not remove current attachments'),
      chatSyncService: { submitPendingSteer: (chatId: string, steerId: string) => {
        assert.equal(chatId, 'chat'); assert.equal(steerId, 'selected');
        return new Promise((resolve, reject) => { settle = () => rejected ? reject(new Error('failed')) : resolve({ accepted: true }); });
      } }
    })('selected');
    settle(); await promise;
  }
});

test('steer restore merges into current draft and declines delivery after target, scope or visit changes', async () => {
  for (const change of ['none', 'chat', 'scope', 'revisit']) {
    let draft = 'new draft', cache = 'scope', finish!: (value: unknown) => void;
    const attachments = ['new'];
    const target = { current: 'chat' }, request = { current: 1 };
    let accepted: boolean | undefined;
    const restoring = callback('handleRestoreSteer', {
      conversationId: 'chat', activeConversationIdRef: target, sendRequestIdRef: request, getChatCacheScopeId: () => cache,
      setComposerDraft: (update: (value: ReturnType<typeof createComposerDraft>) => ReturnType<typeof createComposerDraft>) => { draft = serializeComposerDraft(update(createComposerDraft(draft))); },
      setErrorText() {}, t: (key: string) => key,
      restoreAttachments: (items: { attachmentId: string }[]) => attachments.push(...items.map((item) => item.attachmentId)),
      chatSyncService: { restorePendingSteer: (_chat: string, _id: string, restoreDraft: (value: unknown) => boolean) => new Promise((resolve) => { finish = (value) => { accepted = restoreDraft(value); resolve(accepted ? value : null); }; }) }
    })('pending');
    if (change === 'chat') target.current = 'other';
    if (change === 'scope') cache = 'other';
    if (change === 'revisit') request.current++;
    finish({ message: 'old submitted', phase: 'failed', attachments: [{ attachmentId: 'old' }] });
    await restoring;
    assert.equal(accepted, change === 'none');
    assert.equal(draft, change === 'none' ? 'new draft\n\nold submitted' : 'new draft');
    assert.deepEqual(attachments, change === 'none' ? ['new', 'old'] : ['new']);
  }
});

test('ordinary query preserves planning choice and clears editing only after success', async () => {
  for (const success of [true, false]) {
    let editing = true, planning = true;
    const sending = { current:false };
    const send = callback('handleSend', {
      getChatCacheScopeId:()=> 'scope', socketStatus:'connected', hasUploadingAttachments:false,hasFailedAttachments:false,handleRemoveAttachment(){},restoreAttachments(){},inputReady:true, hasBlockedFiles:false, settings:{modelConfigSaving:false}, draft:'question',readyAttachments:[],composerAttachments:[],
      sendingRef:sending,reaskInFlightRef:{current:false},__DEV__:false,isChatConversationDiagnosticCommand:()=>false,
      conversationId:'chat',sendRequestIdRef:{current:0},hasObservedPendingSendRef:{current:false},activeConversationIdRef:{current:'chat'},
      setSending(){},setDraft(){},setErrorText(){},captureSubmission:()=>()=>{},submitAccessLevel:'default',submitModel:{key:'future'},
      effectivePlanModeEnabled:planning,effectiveEditingModeEnabled:editing,editingModeAvailable:true,selectedSkills:['pdf'],
      setEditingModeEnabled:(value:boolean)=>{editing=value;},setPlanModeEnabled:(value:boolean)=>{planning=value;},clearAttachments(){},
      shouldApplyChatDetailAsyncResult,
      chatSyncService:{sendMessage:async (_chat:string,_text:string,_attachments:unknown[],options:any)=>{
        assert.equal(options.planningMode,true);assert.equal(options.editingMode,true);assert.equal(options.skillIds[0],'pdf');
        if(!success) throw new Error('failed'); return {clientMessageId:'id'};
      }}
    });
    await send();
    assert.equal(editing,!success);assert.equal(planning,true);
  }
});

test('query callbacks preserve later text and files, merging only their failed snapshot within the same visit and scope', async () => {
  for (const outcome of ['success', 'failure', 'context-rejection', 'scope-change', 'same-chat-reentry']) {
    let draft = 'submitted', files = ['old'], scopeId = 'scope', respond!: () => void;
    const request = { current: 0 };
    const attachment = { attachmentId: 'old', kind: outcome === 'context-rejection' ? 'chat' : 'file' };
    const send = callback('handleSend', {
      inputReady: true, hasBlockedFiles: false, hasUploadingAttachments: false, hasFailedAttachments: false,
      settings: { modelConfigSaving: false }, socketStatus: 'connected', getChatCacheScopeId: () => scopeId,
      draft, readyAttachments: [attachment], composerAttachments: [attachment], conversationId: 'chat',
      sendingRef: { current: false }, reaskInFlightRef: { current: false }, __DEV__: false,
      isChatConversationDiagnosticCommand: () => false, sendRequestIdRef: request,
      hasObservedPendingSendRef: { current: false }, activeConversationIdRef: { current: 'chat' },
      setSending() {}, setErrorText() {}, setEditingModeEnabled() {}, captureSubmission: () => () => {},
      submitAccessLevel: 'default', submitModel: {}, effectivePlanModeEnabled: false,
      effectiveEditingModeEnabled: false, editingModeAvailable: true, selectedSkills: ['pdf'],
      t: (key: string) => key, shouldApplyChatDetailAsyncResult,
      setDraft(value: string) { draft = value; },
      setComposerDraft(update: (value: ReturnType<typeof createComposerDraft>) => ReturnType<typeof createComposerDraft>) { draft = serializeComposerDraft(update(createComposerDraft(draft))); },
      handleRemoveAttachment(id: string) { files = files.filter((item) => item !== id); },
      restoreAttachments(items: { attachmentId: string }[]) { files.push(...items.map((item) => item.attachmentId)); },
      chatSyncService: { sendMessage: () => new Promise((resolve, reject) => {
        respond = () => outcome === 'success' ? resolve({ clientMessageId: 'id' })
          : outcome === 'context-rejection' ? resolve({ clientMessageId: 'id', dispatchError: new Error('invalid reference') })
          : reject(new Error('rejected'));
      }) }
    });
    const pending = send();
    assert.equal(draft, ''); assert.deepEqual(files, []);
    draft = 'new draft'; files.push('new');
    if (outcome === 'scope-change') scopeId = 'other';
    if (outcome === 'same-chat-reentry') request.current++;
    respond(); await pending;
    const restore = outcome === 'failure' || outcome === 'context-rejection';
    assert.equal(draft, restore ? 'new draft\n\nsubmitted' : 'new draft');
    assert.deepEqual(files, restore ? ['new', 'old'] : ['new']);
  }
});

import { toggleSkills, resolveSkillIds, skillIdentity } from '../../src/core/api/services/chatSkillsProtocol.ts';
test('running composer allows skill changes and capability loss still allows removing selected skills', async () => {
  for (const capability of [true, false]) {
    const saved: unknown[] = [];
    const change = callback('handleToggleSkills', {
      composerAgentKey: 'agent', sendingRef: { current: false }, composerRunActionRef: { current: 'stop' },
      interaction: { attachment: { skills: capability } }, selectedSkills: ['old'],
      scopedSkills: { catalog: { skills: [{ id: 'old' }, { id: 'new' }], packages: [], pinned: [] } },
      toggleSkills, resolveSkillIds, skillIdentity, setSelectedSkills: (value: unknown) => saved.push(value), setErrorText() {}
    });
    await change(['old']);
    assert.deepEqual(saved[0], []);
    await change(['new']);
    assert.equal(saved.length, capability ? 2 : 1);
  }
});

test('oversized steer returns its full folded snapshot to current input without overwriting subsequent edits', async () => {
  for (const leave of [false, true]) {
    const snapshot = { input:'before after', pastes:[{id:'full',offset:7,text:' FULL\r\n'.repeat(500)}] };
    let current = snapshot, scope = 'scope', reject!: (error: unknown) => void, accepted = false;
    const files: string[] = [];
    const send = callback('handleSteer', {
      conversationId:'chat', draft:serializeComposerDraft(snapshot), composerDraft:snapshot,
      steerAvailable:true,hasUploadingAttachments:false,hasFailedAttachments:false,
      readyAttachments:[{attachmentId:'old'}],selectedSkills:[],activeConversationIdRef:{current:'chat'},
      getChatCacheScopeId:()=>scope,sendRequestIdRef:{current:0},setErrorText(){},t:(key:string)=>key,
      setDraft:(text:string)=>{current=createComposerDraft(text);},
      setComposerDraft:(update:(draft:typeof current)=>typeof current)=>{current=update(current);},
      handleRemoveAttachment:(id:string)=>{files.splice(files.indexOf(id),1);},
      restoreAttachments:(items:{attachmentId:string}[])=>files.push(...items.map(item=>item.attachmentId)),
      chatSyncService:{
        submitPendingSteer:()=>new Promise((_yes,no)=>{reject=no;}),
        restorePendingSteer:async (_chat:string,id:string,receive:(pending:unknown)=>boolean)=>{assert.equal(id,'steer');accepted=receive({message:serializeComposerDraft(snapshot),draft:snapshot,attachments:[{attachmentId:'old'}]});}
      }
    });
    const pending=send('steer');
    current=createComposerDraft('later'); files.push('new');
    if(leave) scope='other';
    reject(Object.assign(new Error('too large'),{code:'WS_FRAME_TOO_LARGE',requestId:'steer',status:413}));
    await pending;
    assert.equal(accepted,!leave);
    assert.equal(serializeComposerDraft(current),leave?'later':`later\n\n${serializeComposerDraft(snapshot)}`);
    assert.equal(current.pastes.length,leave?0:1);
    assert.deepEqual(files,leave?['new']:['new','old']);
  }
});
