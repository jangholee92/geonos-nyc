/** Fixed DINOv2 ViT-S/14 patch representation. The metric has no physical units
 * and is not trained or calibrated as a changed-building classifier. */
export const DINO_GRID=16;
export const DINO_DIMENSIONS=384;
export const DINO_INPUT=224;
export function patchDiscrepancy(before:ArrayLike<number>,after:ArrayLike<number>):number[]{
 const count=DINO_GRID*DINO_GRID*DINO_DIMENSIONS;
 if(before.length!==count||after.length!==count)throw new Error('DINO returned an unexpected patch tensor.');
 const values:number[]=[];
 for(let patch=0;patch<256;patch++){
  let dot=0,n0=0,n1=0;
  for(let d=0;d<384;d++){
   const a=before[patch*384+d],b=after[patch*384+d];
   if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error('DINO returned non-finite patch features.');
   dot+=a*b;n0+=a*a;n1+=b*b;
  }
  if(n0<1e-12||n1<1e-12)throw new Error('DINO returned an empty patch feature.');
  const value=Math.max(0,Math.min(2,1-dot/Math.sqrt(n0*n1)));
  values.push(value<1e-12?0:value);
 }return values;
}
/** Whole-image pixel-center bilinear resampling. Preserves the shared geographic
 * window, including its edges; never fits an alignment to the feature result. */
export function rgbaToDinoInput(rgba:Uint8ClampedArray|Uint8Array,width:number,height:number):Float32Array{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>4096||height>4096||rgba.length!==width*height*4)throw new Error('The aerial-image pixels are invalid.');
 const result=new Float32Array(3*224*224),mean=[.485,.456,.406],std=[.229,.224,.225];
 let sum=0,sum2=0;
 for(let i=0;i<rgba.length;i+=4){const v=(rgba[i]+rgba[i+1]+rgba[i+2])/3;sum+=v;sum2+=v*v;if(rgba[i+3]!==255)throw new Error('The source image contains transparent pixels.');}
 const n=width*height;
 if(sum2/n-(sum/n)**2<1)throw new Error('The source image has insufficient visible detail for this comparison.');
 for(let y=0;y<224;y++){
  const sy=Math.min(height-1,Math.max(0,(y+.5)*height/224-.5)),y0=Math.floor(sy),y1=Math.min(height-1,y0+1),fy=sy-y0;
  for(let x=0;x<224;x++){
   const sx=Math.min(width-1,Math.max(0,(x+.5)*width/224-.5)),x0=Math.floor(sx),x1=Math.min(width-1,x0+1),fx=sx-x0;
   for(let c=0;c<3;c++){
    const top=rgba[(y0*width+x0)*4+c]*(1-fx)+rgba[(y0*width+x1)*4+c]*fx;
    const bottom=rgba[(y1*width+x0)*4+c]*(1-fx)+rgba[(y1*width+x1)*4+c]*fx;
    result[c*224*224+y*224+x]=((top*(1-fy)+bottom*fy)/255-mean[c])/std[c];
   }
  }
 }return result;
}
