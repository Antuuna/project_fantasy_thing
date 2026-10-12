import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestSignup,requestRecovery} from '../../lib/auth/requests.ts';

test('signup mail and request throttles make one call and never report a session or success',async()=>{
  for (const [code,message] of [['over_email_send_rate_limit','email sending limit'],['over_request_rate_limit','Too many registration']]) {
    let calls=0;
    const result=await requestSignup(async()=>{calls++;return {data:{session:{}},error:{code}};},'synthetic@example.com','synthetic-password','http://localhost:3101/auth/callback');
    assert.equal(calls,1);
    assert.equal(result.signedIn,false);
    assert.match(result.state.error!,new RegExp(message));
    assert.equal(result.state.message,undefined);
  }
});
test('signup preserves both confirmation configurations',async()=>{
  const noSession=await requestSignup(async()=>({data:{session:null},error:null}),'a@example.com','synthetic-password','http://localhost:3101/auth/callback');
  assert.equal(noSession.signedIn,false);
  assert.match(noSession.state.message!,/Check your email/);
  const session=await requestSignup(async()=>({data:{session:{}},error:null}),'a@example.com','synthetic-password','http://localhost:3101/auth/callback');
  assert.equal(session.signedIn,true);
  assert.deepEqual(session.state,{});
});
test('recovery send failure has no false success or retries; success is account-neutral',async()=>{
  let calls=0;
  const failure=await requestRecovery(async()=>{calls++;return {error:new Error('Synthetic send failure')};},'a@example.com','http://localhost:3101/auth/callback');
  assert.equal(calls,1);
  assert.match(failure.error!,/Unable to send a reset email/);
  assert.equal(failure.message,undefined);
  const messages=await Promise.all(['exists@example.com','absent@example.com'].map(email=>requestRecovery(async()=>({error:null}),email,'http://localhost:3101/auth/callback')));
  assert.deepEqual(messages[0],messages[1]);
});
