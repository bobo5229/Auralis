import { buildPaletteSync, utils, distance, image } from '../../.electron-home/cover-filter-build/node_modules/image-q/dist/esm/image-q.mjs'
self.onmessage=({data})=>{try{
 const output=data.inputs.map(input=>{
  const points=utils.PointContainer.fromUint8Array(new Uint8ClampedArray(input.pixels),input.size,input.size);
  const options={colors:input.colors,paletteQuantization:'wuquant',colorDistanceFormula:'euclidean-bt709'};
  const palette=buildPaletteSync([points],options),metric=new distance.EuclideanBT709();
  const quantizer=data.strength===0?new image.NearestColor(metric):new image.ErrorDiffusionArray(metric,data.algorithm==='atkinson'?image.ErrorDiffusionArrayKernel.Atkinson:image.ErrorDiffusionArrayKernel.FloydSteinberg,true,(1-data.strength)*.2);
  const result=quantizer.quantizeSync(points,palette).toUint8Array();
  return {size:input.size,pixels:result.buffer,palette:palette.getPointContainer().getPointArray().map(p=>[p.r,p.g,p.b])};
 });self.postMessage({output},output.map(o=>o.pixels));
}catch(error){self.postMessage({error:error.message})}};
