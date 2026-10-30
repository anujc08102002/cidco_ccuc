// A short, two-note attention signal with a firm midrange voice.
// Smooth attack/release envelopes avoid clicks and a brittle bell-like decay.
export function playNotificationSound(context:BaseAudioContext){
 const start=context.currentTime+.015;
 const notes=[{at:0,hz:523.25,length:.14},{at:.19,hz:659.25,length:.23}];
 for(const note of notes){
  for(const voice of [{multiple:1,level:.3,type:'triangle' as OscillatorType},{multiple:2,level:.065,type:'sine' as OscillatorType}]){
   const oscillator=context.createOscillator(),gain=context.createGain(),at=start+note.at,end=at+note.length;
   oscillator.type=voice.type;oscillator.frequency.value=note.hz*voice.multiple;
   gain.gain.setValueAtTime(0,at);
   gain.gain.linearRampToValueAtTime(voice.level,at+.015);
   gain.gain.setValueAtTime(voice.level*.85,end-.045);
   gain.gain.linearRampToValueAtTime(0,end);
   oscillator.connect(gain).connect(context.destination);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
   oscillator.start(at);oscillator.stop(end+.01);
  }
 }
}
