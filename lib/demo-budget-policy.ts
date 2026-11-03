export type DemoKind='chat'|'voice';
export type DemoLimits={dailyChat:number;dailyVoice:number;lifetimeChat:number;lifetimeVoice:number;ipChat:number;ipVoice:number;burst:number;concurrent:number};
export type DemoState={day:number;daily:{chat:number;voice:number};lifetime:{chat:number;voice:number};ips:Record<string,{day:number;chat:number;voice:number;minute:number;burst:number}>;leases:Record<string,{expires:number;ip:string}>};
export const LEASE_MS=240_000;
const specs=[['dailyChat','DEMO_DAILY_CHAT',60,300],['dailyVoice','DEMO_DAILY_VOICE',20,100],['lifetimeChat','DEMO_LIFETIME_CHAT',300,1000],['lifetimeVoice','DEMO_LIFETIME_VOICE',100,500],['ipChat','DEMO_IP_DAILY_CHAT',20,100],['ipVoice','DEMO_IP_DAILY_VOICE',6,30],['burst','DEMO_BURST_PER_MINUTE',3,10],['concurrent','DEMO_CONCURRENT',2,4]] as const;
export function demoLimits(env:Record<string,unknown>):DemoLimits{
 const out={} as DemoLimits;
 for(const[field,key,fallback,max]of specs){const raw=env[key];if(raw===undefined){out[field]=fallback;continue;}if(typeof raw!=='string'||!/^\d{1,4}$/.test(raw))throw Error('Invalid demo allowance configuration');const n=Number(raw);if(n<0||n>max)throw Error('Invalid demo allowance configuration');out[field]=n;}
 return out;
}
export function emptyDemoState(now:number):DemoState{return{day:Math.floor(now/86400000),daily:{chat:0,voice:0},lifetime:{chat:0,voice:0},ips:{},leases:{}};}
export type Reservation={allowed:true;leaseId:string}|{allowed:false;code:string;retryAfter:number};
/** Pure policy; its state is committed in one Durable Object storage transaction. */
export function reserveDemo(state:DemoState,limits:DemoLimits,kind:DemoKind,ip:string,now:number,leaseId:string):Reservation{
 if(!/^[a-f0-9]{64}$/.test(ip)||!['chat','voice'].includes(kind)||!Number.isFinite(now)||!leaseId)throw Error('Invalid reservation');
 const day=Math.floor(now/86400000),minute=Math.floor(now/60000);
 if(state.day!==day){state.day=day;state.daily={chat:0,voice:0};state.ips={};}
 for(const[id,lease]of Object.entries(state.leases))if(lease.expires<=now)delete state.leases[id];
 const item=state.ips[ip]??{day,chat:0,voice:0,minute,burst:0};
 if(item.minute!==minute){item.minute=minute;item.burst=0;}
 const field=kind==='chat'?'Chat':'Voice';
 if(state.lifetime[kind]>=limits[('lifetime'+field) as keyof DemoLimits])return{allowed:false,code:'DEMO_LIFETIME_LIMIT',retryAfter:86400};
 if(state.daily[kind]>=limits[('daily'+field) as keyof DemoLimits]||item[kind]>=limits[('ip'+field) as keyof DemoLimits])return{allowed:false,code:'DEMO_DAILY_LIMIT',retryAfter:Math.max(1,Math.ceil(((day+1)*86400000-now)/1000))};
 if(item.burst>=limits.burst)return{allowed:false,code:'DEMO_BURST_LIMIT',retryAfter:60};
 if(Object.keys(state.leases).length>=limits.concurrent||Object.values(state.leases).some(x=>x.ip===ip))return{allowed:false,code:'DEMO_BUSY',retryAfter:15};
 // Accepted interactions are charged even if downstream retrieval/model work fails.
 // These counters bound interaction counts, not a monetary amount.
 state.daily[kind]++;state.lifetime[kind]++;item[kind]++;item.burst++;state.ips[ip]=item;state.leases[leaseId]={expires:now+LEASE_MS,ip};
 return{allowed:true,leaseId};
}
