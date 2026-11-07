import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const ref=path.resolve(import.meta.dirname,'../../skills/produce/references');
const {bound}=require(path.join(ref,'subtitle-clock.js'));
const ticks=(s,k)=>{const [h,m,sec]=s.replace(',','.').split(':');return Math.round((Number(h)*3600+Number(m)*60+Number(sec))*k);};
test('inside ticks and aligned one-tick windows remain unchanged; only outside endpoints move',()=>{
  assert.deepEqual(bound(1,60,30,'00:00:00,033','00:00:02,033','0:00:00.03','0:00:02.03'),['00:00:00,034','00:00:02,033','0:00:00.04','0:00:02.03']);
  assert.deepEqual(bound(0,2,30,'00:00:00,000','00:00:00,067','0:00:00.00','0:00:00.07'),['00:00:00,000','00:00:00,066','0:00:00.00','0:00:00.06']);
  assert.deepEqual(bound(0,180,30,'00:00:00,280','00:00:05,280','0:00:00.28','0:00:05.28'),['00:00:00,280','00:00:05,280','0:00:00.28','0:00:05.28']);
  assert.deepEqual(bound(1,1,100,'00:00:00,010','00:00:00,020','0:00:00.01','0:00:00.02'),['00:00:00,010','00:00:00,020','0:00:00.01','0:00:00.02']);
});
test('minute/hour carry uses integer ticks, including a legacy printf rounding seconds to 60',()=>{
  assert.deepEqual(bound(1799,2,30,'00:00:59,967','00:01:00,033','0:00:59.97','0:01:00.03'),['00:00:59,967','00:01:00,033','0:00:59.97','0:01:00.03']);
  assert.deepEqual(bound(107999,2,30,'00:59:59,967','01:00:00,033','0:59:59.97','1:00:00.03'),['00:59:59,967','01:00:00,033','0:59:59.97','1:00:00.03']);
  assert.deepEqual(bound(1799,2,30,'00:00:60,000','00:01:00,030','0:00:60.00','0:01:00.03'),['00:01:00,000','00:01:00,030','0:01:00.00','0:01:00.03']);
});
test('frame bounds use integer arithmetic for cumulative cards and the builder integer-FPS form',()=>{
  for(const fps of ['24','25','30','60','48','120']){
    const n=BigInt(fps)*3600n+1n;
    const got=bound(String(n),String(BigInt(fps)*2n),fps,'01:00:00,000','01:00:01,999','1:00:00.00','1:00:01.99');
    assert.ok(ticks(got[0],1000)*Number(fps)>=Number(n)*1000);
    assert.ok(ticks(got[2],100)*Number(fps)>=Number(n)*100);
    assert.equal(got[1],'01:00:01,999');assert.equal(got[3],'1:00:01.99');
  }
  // build-reel.sh uses integer shell FPS for SPF and frame arithmetic. This
  // helper does not introduce fractional/decimal FPS support into that builder.
  for(const fps of ['0','-30','30.0','30000/1001','NaN'])assert.throws(()=>bound(0,30,fps,'00:00:00,000','00:00:01,000','0:00:00.00','0:00:01.00'),/frame clock/);
});
