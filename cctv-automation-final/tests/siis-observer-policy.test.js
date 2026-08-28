const test=require('node:test');
const assert=require('node:assert/strict');
const {parseClock,observerPolicy}=require('../platform/siis-observer-policy');

test('aplica cinco minutos a las ventanas operativas conocidas',()=>{
  for(const time of ['06:00','08:45','13:15','15:10','18:05','21:30']){
    const result=observerPolicy(parseClock(time));
    assert.equal(result.mode,'PEAK',time);
    assert.equal(result.intervalMinutes,5,time);
  }
});

test('mantiene cinco minutos entre ventanas y se detiene fuera de jornada',()=>{
  assert.equal(observerPolicy(parseClock('11:00')).intervalMinutes,5);
  assert.equal(observerPolicy(parseClock('14:20')).intervalMinutes,5);
  assert.equal(observerPolicy(parseClock('19:30')).intervalMinutes,5);
  assert.equal(observerPolicy(parseClock('04:00')).mode,'OUTSIDE_WINDOW');
  assert.equal(observerPolicy(parseClock('23:05')).mode,'OUTSIDE_WINDOW');
});
