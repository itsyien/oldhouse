// 8F is the tutorial. Shorten each warning by a tenth of the 7F duration per floor.
export const rushWarningSeconds=floor=>(Math.min(floor,7)+3)*8/10;

export function sweepTiming(threat){
 const time=threat.age-threat.warning,rush=threat.kind==='rush';
 const first=rush?1.3:3;
 if(time<0)return {phase:'warning',elapsed:threat.age,duration:threat.warning,wave:1};
 if(time<first)return {phase:'sweeping',elapsed:time,duration:first,wave:1};
 if(rush){
  const gap=time-first,pause=1.6;
  if(gap<pause)return {phase:'between',elapsed:gap,duration:pause,wave:1};
  const warning=threat.warning*.3,returnAge=gap-pause;
  if(returnAge<warning)return {phase:'return-warning',elapsed:returnAge,duration:warning,wave:2};
  const sweepAge=returnAge-warning;
  if(sweepAge<.95)return {phase:'sweeping',elapsed:sweepAge,duration:.95,wave:2};
  return {phase:'leaving',elapsed:sweepAge-.95,duration:1.3,wave:2};
 }
 return {phase:'leaving',elapsed:time-first,duration:1.3,wave:1};
}
