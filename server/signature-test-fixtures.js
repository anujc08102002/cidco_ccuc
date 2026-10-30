import {createCanvas} from '@napi-rs/canvas';
// Artificial pen strokes for local fixtures only. Never an officer identity.
export function testHandwriting(){
 const canvas=createCanvas(600,250),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,250);ctx.strokeStyle='#183b7f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(80,160);ctx.bezierCurveTo(130,10,100,220,210,100);ctx.bezierCurveTo(250,40,200,180,390,110);ctx.stroke();
 return {base64:canvas.toBuffer('image/png').toString('base64'),crop:{x:60,y:20,width:370,height:190},confirmed:true,reason:'Artificial acceptance signature fixture',expectedHash:null,sourceName:'acceptance-signature.png'};
}
