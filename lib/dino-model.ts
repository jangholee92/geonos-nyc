/** Decode the one pinned model asset. Both transport bytes and decoded ONNX
 * bytes are bounded and hashed before any inference engine sees the model. */
export type DinoModelDownload={bytes:number;sha256:string;decodedBytes:number;decodedSha256:string};
const MAX=25*1024*1024,HASH=/^[a-f0-9]{64}$/;
async function readBounded(stream:ReadableStream<Uint8Array>,expected:number):Promise<Uint8Array>{
 const reader=stream.getReader(),parts:Uint8Array[]=[];let total=0;
 try{while(true){const{value,done}=await reader.read();if(done)break;total+=value.length;if(total>expected)throw Error('The model exceeded its verified byte bound.');parts.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(total!==expected)throw Error('The model size did not match its manifest.');
 const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
const sha256=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function decodeDinoModelDownload(response:Response,expected:DinoModelDownload):Promise<Uint8Array>{
 if(!Number.isInteger(expected.bytes)||expected.bytes<1||expected.bytes>MAX||!Number.isInteger(expected.decodedBytes)||expected.decodedBytes<1||expected.decodedBytes>MAX||!HASH.test(expected.sha256)||!HASH.test(expected.decodedSha256))throw Error('The model download manifest is invalid.');
 if(!response.ok||Number(response.headers.get('content-length'))>expected.bytes){await response.body?.cancel();throw Error('The verified DINOv2 model is unavailable.');}
 if(!response.body)throw Error('The model response is empty.');
 const compressed=await readBounded(response.body,expected.bytes);
 if(await sha256(compressed)!==expected.sha256)throw Error('The compressed model did not match its verified SHA-256.');
 if(typeof DecompressionStream==='undefined')throw Error('This browser cannot decode the compressed visual model.');
 const decodedStream=new Blob([compressed.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
 const decoded=await readBounded(decodedStream,expected.decodedBytes);
 if(await sha256(decoded)!==expected.decodedSha256)throw Error('The decoded model did not match its verified SHA-256.');
 return decoded;
}
