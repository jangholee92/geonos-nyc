"""Export official DINOv2 ViT-S/14-reg to a bounded, fixed-shape INT8 graph.

Run in the isolated research/dino-runtime/.venv. No account or model service is
used. Inputs are 224x224 RGB normalized with ImageNet mean/std; output is the
256 post-layernorm patch tokens, not a change classifier. Keep intermediate
FP32/checkpoint files outside deployed public assets.
"""
from pathlib import Path
import argparse, gzip, hashlib, json, os, subprocess, sys, time, types
os.environ['XFORMERS_DISABLED']='1'
import numpy as np
import torch
import onnx
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType
from PIL import Image

p=argparse.ArgumentParser();p.add_argument('--research',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--images',type=Path,nargs=2,required=True)
a=p.parse_args(); a.research=a.research.resolve(); a.output=a.output.resolve();a.output.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(a.research/'dinov2'))
from dinov2.hub.backbones import dinov2_vits14_reg
checkpoint=a.research/'dinov2_vits14_reg4_pretrain.pth'
source_url='https://dl.fbaipublicfiles.com/dinov2/dinov2_vits14/dinov2_vits14_reg4_pretrain.pth'
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
torch.set_num_threads(4)
model=dinov2_vits14_reg(pretrained=False).eval()
model.load_state_dict(torch.load(checkpoint,map_location='cpu',weights_only=True),strict=True)
# The official positional interpolation uses bicubic antialiasing, which the
# legacy ONNX exporter cannot express. For our fixed 224px input, compute that
# exact official interpolation once, then freeze its tensor (no retraining).
with torch.inference_mode():
 fixed_positions=model.interpolate_pos_encoding(torch.zeros(1,257,384),224,224).clone()
model.register_buffer('export_positions_224',fixed_positions)
def fixed_position_encoding(self,x,w,h):return self.export_positions_224.to(dtype=x.dtype)
model.interpolate_pos_encoding=types.MethodType(fixed_position_encoding,model)
class PatchFeatures(torch.nn.Module):
 def __init__(self,backbone):super().__init__();self.backbone=backbone
 def forward(self,x):return self.backbone.forward_features(x)['x_norm_patchtokens']
wrapped=PatchFeatures(model).eval();fp=a.research/'dinov2-vits14-reg-patches-fp32.onnx';out=a.research/'dinov2-vits14-reg-patches-int8.onnx'
example=torch.zeros(1,3,224,224)
with torch.inference_mode():
 torch.onnx.export(wrapped,example,str(fp),input_names=['image'],output_names=['patches'],opset_version=17,dynamo=False,do_constant_folding=True)
onnx.checker.check_model(str(fp))
# Weight-only QDQ keeps activations float32. Dynamic activation quantization
# materially distorted these features in a rejected pilot. Store only constant
# linear MatMul weights as symmetric per-output-channel INT8, then dequantize
# in the standard ONNX graph. This is a download-size optimization, not an INT8
# execution-speed claim.
from onnx import numpy_helper, helper
quant=onnx.load(str(fp));initializers={v.name:v for v in quant.graph.initializer};changed={};dequantizers=[]
for node in quant.graph.node:
 if node.op_type!='MatMul' or node.input[1] not in initializers:continue
 name=node.input[1]
 if name in changed:node.input[1]=changed[name];continue
 weight=numpy_helper.to_array(initializers[name])
 if weight.ndim!=2 or weight.dtype!=np.float32:continue
 scale=np.maximum(np.max(np.abs(weight),axis=0)/127,np.finfo(np.float32).tiny).astype(np.float32)
 q=np.clip(np.rint(weight/scale[None,:]),-127,127).astype(np.int8)
 qname=name+'_int8';sname=name+'_scale';zname=name+'_zero';dname=name+'_dequantized'
 quant.graph.initializer.extend([numpy_helper.from_array(q,qname),numpy_helper.from_array(scale,sname),numpy_helper.from_array(np.zeros(scale.shape,dtype=np.int8),zname)])
 dequantizers.append(helper.make_node('DequantizeLinear',[qname,sname,zname],[dname],axis=1,name=dname));changed[name]=dname;node.input[1]=dname
retained=[v for v in quant.graph.initializer if v.name not in changed]
del quant.graph.initializer[:];quant.graph.initializer.extend(retained)
original_nodes=list(quant.graph.node);del quant.graph.node[:];quant.graph.node.extend(dequantizers+original_nodes)
onnx.save(quant,str(out))
onnx.checker.check_model(str(out))
if out.stat().st_size>=25*1024*1024:raise RuntimeError('INT8 graph exceeds the 25 MiB deployment bound')
options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL
session=ort.InferenceSession(str(out),sess_options=options,providers=['CPUExecutionProvider'])
# Explicit pixel-center bilinear resize, matching the browser helper. No crop,
# fitted alignment, contrast adjustment, or source-image editing is performed.
def preprocess(path):
 rgb=np.asarray(Image.open(path).convert('RGB'),dtype=np.float32);h,w,_=rgb.shape
 xx=np.clip((np.arange(224)+.5)*w/224-.5,0,w-1);yy=np.clip((np.arange(224)+.5)*h/224-.5,0,h-1)
 x0=np.floor(xx).astype(int);y0=np.floor(yy).astype(int);x1=np.minimum(x0+1,w-1);y1=np.minimum(y0+1,h-1);fx=(xx-x0)[None,:,None];fy=(yy-y0)[:,None,None]
 small=(rgb[y0[:,None],x0[None,:]]*(1-fx)+rgb[y0[:,None],x1[None,:]]*fx)*(1-fy)+(rgb[y1[:,None],x0[None,:]]*(1-fx)+rgb[y1[:,None],x1[None,:]]*fx)*fy
 norm=(small/255-np.array([.485,.456,.406]))/np.array([.229,.224,.225]);return np.ascontiguousarray(norm.transpose(2,0,1)[None],dtype=np.float32)
results=[];tokens=[]
for index,path in enumerate(a.images):
 x=preprocess(path);start=time.perf_counter();q=session.run(['patches'],{'image':x})[0];elapsed=time.perf_counter()-start
 with torch.inference_mode():original=wrapped(torch.from_numpy(x)).numpy()
 n=lambda y:y/np.linalg.norm(y,axis=-1,keepdims=True)
 agreement=(n(original)*n(q)).sum(-1)
 print('VALIDATION',index,q.shape,float(agreement.min()),float(agreement.mean()),flush=True)
 if q.shape!=(1,256,384) or not np.isfinite(q).all() or float(agreement.min())<.98:raise RuntimeError('Quantization verification failed')
 tokens.append(q);x.tofile(a.research/f'validation-input-{index}.f32');q.tofile(a.research/f'validation-patches-{index}.f32')
 results.append({'source_image':path.name,'image_sha256':sha(path),'inference_seconds_cpu':round(elapsed,5),'patch_cosine_to_torch':{'minimum':float(agreement.min()),'mean':float(agreement.mean())}})
normalize=lambda y:y/np.linalg.norm(y,axis=-1,keepdims=True)
distance=1-(normalize(tokens[0])*normalize(tokens[1])).sum(-1)
compressed=a.output/(out.name+'.gzip');compressed.write_bytes(gzip.compress(out.read_bytes(),compresslevel=9,mtime=0))
manifest={
 'schema_version':1,'model':'DINOv2 ViT-S/14 with registers','model_id':'dinov2_vits14_reg','publisher':'Meta FAIR','license':'Apache-2.0','source_repository':'https://github.com/facebookresearch/dinov2','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=a.research/'dinov2',text=True).strip(),'source_model_card':'https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md','checkpoint':{'url':source_url,'sha256':sha(checkpoint),'bytes':checkpoint.stat().st_size},
 'artifact':{'path':'/models/dinov2/'+compressed.name,'download':{'path':'/models/dinov2/'+compressed.name,'encoding':'gzip','bytes':compressed.stat().st_size,'sha256':sha(compressed)},'decoded_filename':out.name,'size_hash_scope':'artifact.bytes/sha256 describe the decoded ONNX; artifact.download describes the actual compressed public asset.','sha256':sha(out),'bytes':out.stat().st_size,'format':'ONNX','opset':17,'quantization':'symmetric per-output-channel INT8 constant MatMul weights, standard QDQ; activations and remaining operations float32','input_name':'image','input_shape':[1,3,224,224],'output_name':'patches','output_shape':[1,256,384]},
 'fixed_position_encoding':'Official antialiased bicubic positional embedding precomputed exactly once at224px; frozen in ONNX, no retraining',
 'preprocessing':{'color':'RGB','resize':'whole crop, pixel-center bilinear, 224 x 224; no center crop','mean':[.485,.456,.406],'std':[.229,.224,.225]},'comparison':{'metric':'1 - cosine similarity between corresponding 384-dimensional patch vectors','grid':[16,16],'range':[0,2],'meaning':'Relative feature discrepancy for visual inspection, not a calibrated change probability, material label or condition assessment. Self-attention includes context outside each patch.'},
 'validation':{'torch_version':torch.__version__,'onnx_version':onnx.__version__,'onnxruntime_version':ort.__version__,'device':'CPU, four inference threads','graph_optimization':'disabled to preserve explicit QDQ graph across native and browser runtimes','images':results,'pair_discrepancy':{'minimum':float(distance.min()),'maximum':float(distance.max()),'mean':float(distance.mean())},'browser_status':'pending actual browser inference; this is native validation only'},
 'limitations':['Natural-image pretrained features have not been calibrated as a NYC aerial change detector.','Matched export bounds do not guarantee pixel-perfect image registration.','Shadows, season, lighting, view reconstruction, parked objects and image processing can change features.','Each cell is a coarse contextual feature; no changed area, structural change, roof condition, flood risk or engineering suitability is inferred.']}
old_plain=a.output/out.name
if old_plain.exists():old_plain.unlink()
(a.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(a.output/'LICENSE.txt').write_text((a.research/'dinov2'/'LICENSE').read_text());print(json.dumps(manifest,indent=2))
