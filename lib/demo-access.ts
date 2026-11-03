import {AsyncLocalStorage} from 'node:async_hooks';
/** An anonymous rate-limit actor, never an authenticated person or account. */
export type DemoActor={kind:'anonymous-demo';userId:string};
const actors=new AsyncLocalStorage<DemoActor|null>();
export const runWithDemoActor=<T>(actor:DemoActor|null,run:()=>T):T=>actors.run(actor,run);
export const getDemoActor=async():Promise<DemoActor|null>=>actors.getStore()??null;
