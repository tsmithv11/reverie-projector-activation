// Separate photographic surround and painted interior, as in the reference.
// Neither image is sampled through a displacement/warping shader.
export class LivingBay {
  constructor(images){this.images=images;this.mode='reference-layers';}
  render(ctx,w,h){
    const image=this.images.surround, scale=Math.max(w/image.naturalWidth,h/image.naturalHeight);
    ctx.drawImage(image,(w-image.naturalWidth*scale)/2,(h-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
  }
  interior(ctx,w,h){ctx.drawImage(this.images.interior,0,0,w,h);}
  waterClip(ctx,w,h){ctx.beginPath();ctx.rect(0,h*.595,w,h*.405);ctx.clip();}
  rock(ctx,w,h){
    const image=this.images.rock, height=h*.40, width=height*image.naturalWidth/image.naturalHeight;
    ctx.drawImage(image,w*.47,h*.39,width,height);
  }
  cleanup(){this.images=null;}
}
