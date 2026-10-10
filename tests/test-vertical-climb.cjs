const assert = require('node:assert/strict');
const { harness } = require('./test-behavior-platforms.cjs');
const { chooseClimb, climbGeometry } = require('../climb-motion.cjs');
const makeWindow = () => ({ id:'explorer', bounds:{x:100,y:400,width:800,height:500}, client:{x:100,y:435,width:800,height:465} });
function makePet() { const pet=harness();const window=makeWindow();pet.frames([window]);pet.settings('pet:walking',false);return {pet,window}; }
function until(pet,check,seconds=25) {for(let n=0;n<seconds/.016;n++){if(check(pet.state()))return pet.state();pet.tick(.016);}throw Error('Condition not reached: '+JSON.stringify(pet.state()));}
function dragTo(pet,x,foot) {const b=pet.state().bounds;pet.send('pet:drag-start',{x:100.4,y:100.8});pet.send('pet:drag-move',{x:100.4+x-b.x,y:100.8+foot-b.height-b.y});pet.send('pet:drag-end',true);pet.tick(8);}
for(const side of ['left','right']) {
  const {pet,window}=makePet();
  if(side==='left')dragTo(pet,0,1000);
  pet.settings('pet:preview','climb');assert.equal(pet.state().climbing.phase,'approach');assert.equal(pet.state().climbing.side,side);
  until(pet,s=>s.climbing?.phase==='ascend');const start=pet.state();pet.tick(.5);const ascending=pet.state();
  assert.equal(ascending.action,'climb');assert(ascending.bounds.y<start.bounds.y-30);assert.equal(ascending.bounds.x,start.bounds.x);
  assert(!ascending.falling&&!ascending.docked);
  until(pet,s=>s.climbing?.phase==='crest');const crest=pet.state();pet.tick(.4);assert.notEqual(pet.state().bounds.x,crest.bounds.x);
  const landed=until(pet,s=>!s.climbing&&s.support?.edge==='top');
  assert.equal(landed.bounds.y+landed.bounds.height,window.bounds.y);assert(landed.bounds.x>=window.bounds.x);assert(landed.bounds.x+landed.bounds.width<=window.bounds.x+window.bounds.width);
}
const moving=makePet();moving.pet.settings('pet:preview','climb');until(moving.pet,s=>s.climbing?.phase==='ascend');
moving.pet.tick(.5); // Test following away from the screen-bottom safety clamp.
const old=moving.pet.state().bounds;moving.window.bounds.x+=40;moving.window.bounds.y+=20;moving.window.client.x+=40;moving.window.client.y+=20;moving.pet.tick(.1);
assert.equal(moving.pet.state().bounds.x,old.x+40);assert(moving.pet.state().bounds.y>old.y+10);
moving.pet.frames([]);moving.pet.tick(.2);assert(moving.pet.state().climbing);const paused=moving.pet.state().bounds;moving.pet.tick(.2);assert.deepEqual(moving.pet.state().bounds,paused);
moving.pet.frames([moving.window]);moving.pet.tick(.1);assert(moving.pet.state().climbing);
moving.pet.frames([]);moving.pet.tick(.8);assert(!moving.pet.state().climbing);assert(moving.pet.state().falling);moving.pet.tick(10);assert(moving.pet.state().docked);
const dragged=makePet();dragged.pet.settings('pet:preview','climb');until(dragged.pet,s=>s.climbing?.phase==='ascend');dragged.pet.tick(.5);dragged.pet.send('pet:drag-start',{x:100.4,y:100.8},2);
assert(!dragged.pet.state().climbing);const held=dragged.pet.state().bounds;dragged.pet.tick(3);assert.deepEqual(dragged.pet.state().bounds,held);assert(!dragged.pet.state().falling);
dragged.pet.send('pet:drag-end',true);dragged.pet.tick(.2);assert(dragged.pet.state().falling);dragged.pet.tick(10);assert(dragged.pet.state().docked);
const inside=makePet();dragTo(inside.pet,400,896);assert.equal(inside.pet.state().support.edge,'inside');inside.pet.settings('pet:preview','climb');
const insideX=inside.pet.state().bounds.x;inside.pet.tick(1);assert(Math.abs(Math.abs(inside.pet.state().bounds.x-insideX)-45)<=1,'Inside approach preserves 45 DIP/s');
until(inside.pet,s=>s.climbing?.phase==='ascend');assert(inside.pet.state().bounds.x>=100);until(inside.pet,s=>!s.climbing&&s.support?.edge==='top');
const resized=makePet();resized.pet.settings('pet:preview','climb');until(resized.pet,s=>s.climbing?.phase==='ascend');resized.pet.tick(.5);resized.window.bounds.y=200;resized.pet.tick(.1);assert(!resized.pet.state().climbing);assert(resized.pet.state().falling);
const automatic=harness(.1);automatic.frames([makeWindow()]);automatic.tick(20);assert(automatic.state().climbing,'Automatic activity chooses eligible climb');until(automatic,s=>s.support?.edge==='top');
const scale=makePet();scale.pet.settings('pet:preview','climb');until(scale.pet,s=>s.climbing?.phase==='ascend');scale.pet.tick(.5);scale.pet.settings('pet:scale',150);assert(!scale.pet.state().climbing);assert(scale.pet.state().falling);
const geometry=climbGeometry(makeWindow(),{width:204,height:324},{x:0,y:0,width:1200,height:1000},'left');assert(geometry);
assert.equal(chooseClimb([{...makeWindow(),bounds:{x:100,y:100,width:800,height:500}}],{x:900,y:676,width:204,height:324},{x:0,y:0,width:1200,height:1000},null),null,'No room above rejects climb');
console.log(JSON.stringify({leftAndRightApproach:true,verticalAscent:true,crestAndLandOnTop:true,tracksMovingWindow:true,missingWindowGrace:true,windowLostFalls:true,dragCancelsAndFreezes:true,insideFrameClimb:true,unreachableWindowRejected:true,automaticClimb:true,resizeCancelsSafely:true}));
