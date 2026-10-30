import test from 'node:test';
import assert from 'node:assert/strict';
import {accountNotificationId,caseNotificationId,inboxEntry,notificationKey,notificationVisible,parseInbox} from '../shared/notification-inbox.js';
import {defaultPreferences,validatePreferences} from '../shared/account-preferences.js';

test('notification expiry uses first receipt, survives read and supports keeping entries',()=>{
 const received=inboxEntry(undefined,1000),read={...received,readAt:4000};
 assert(notificationVisible(received,1,60999));assert(!notificationVisible(read,1,61000));
 assert(notificationVisible(read,0,Number.MAX_SAFE_INTEGER));
 assert.deepEqual(inboxEntry(read,9000),read,'Refreshing cannot reset the expiry clock');
 assert.deepEqual(parseInbox(JSON.stringify({one:read})),{one:read});
 for(const value of ['null','[]','broken','{"x":{"firstSeen":"y"}}'])assert.deepEqual(parseInbox(value),{});
});
test('notification identities isolate accounts and re-alert on workflow changes',()=>{
 assert.notEqual(notificationKey('account-A'),notificationKey('account-B'));
 const item={id:'CASE/1',workflowStep:'review',status:'In progress',legal:false};
 assert.notEqual(caseNotificationId(item),caseNotificationId({...item,workflowStep:'notice-draft'}));
 assert.notEqual(caseNotificationId(item),caseNotificationId({...item,legal:true}));
 assert.notEqual(accountNotificationId({id:'request',status:'Pending'}),accountNotificationId({id:'request',status:'Resolved'}));
});
test('notification preferences migrate old settings and reject invalid durations',()=>{
 const defaults=defaultPreferences();assert.equal(defaults.notificationRetentionMinutes,1440);assert.equal(defaults.desktopNotificationSeconds,10);
 assert.equal(validatePreferences({},'master').desktopNotificationSeconds,10);
 for(const key of ['notificationRetentionMinutes','desktopNotificationSeconds'])for(const value of [-1,NaN,'10',Infinity,999999])assert.throws(()=>validatePreferences({...defaults,[key]:value},'master'),/Choose a valid/);
 for(const value of [0,1,5,15,60,1440,10080,43200])assert.equal(validatePreferences({...defaults,notificationRetentionMinutes:value},'master').notificationRetentionMinutes,value);
});
