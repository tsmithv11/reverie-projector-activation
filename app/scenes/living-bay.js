// Restore the original dimensional painting. Geometry and reflections are
// drawn over it by LivingWater; the plate itself is never displaced.
const ROCK=[[.451,.697],[.459,.650],[.474,.590],[.483,.566],[.495,.523],[.514,.493],[.531,.503],[.553,.548],[.571,.596],[.592,.626],[.613,.697],[.613,.716],[.448,.716]];
const SHORE=[[1,.614],[.925,.681],[.89,.704],[.86,.747],[.84,.791],[.80,.819],[.77,.855],[.74,.891],[.71,.929],[.67,.974],[.64,1],[1,1]];
const path=(ctx,points,w,h)=>{points.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.closePath();};
export class LivingBay {
  constructor(image){this.image=image;this.mode='painted-reference';}
  render(ctx,w,h){ctx.drawImage(this.image,0,0,w,h);}
  waterClip(ctx,w,h){ctx.beginPath();path(ctx,[[0,.602],[.68,.602],[1,.614],[1,1],[0,1]],w,h);path(ctx,ROCK,w,h);path(ctx,SHORE,w,h);ctx.clip('evenodd');}
  rock(ctx,w,h){ctx.save();ctx.beginPath();path(ctx,ROCK,w,h);ctx.clip();ctx.drawImage(this.image,0,0,w,h);ctx.restore();}
  shore(ctx,w,h){ctx.save();ctx.beginPath();path(ctx,SHORE,w,h);ctx.clip();ctx.drawImage(this.image,0,0,w,h);ctx.restore();}
  cleanup(){this.image=null;}
}
