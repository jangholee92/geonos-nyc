import handler from 'vinext/server/fetch-handler';
import {gateDemo,type DemoEnv} from '../lib/demo-gate';
import {runWithMetaSpend} from '../lib/meta-paid-fetch';
import {runWithLocalReviewActor} from '../lib/local-review-auth';
export {DemoBudget} from './demo-budget';
export default {
  fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
    // The local actor is established before the public gate removes internal
    // headers; its request-local context never grants hosted Meta access.
    return runWithLocalReviewActor(request,env as unknown as DemoEnv,import.meta.env.DEV,()=>
      runWithMetaSpend(env as unknown as DemoEnv,()=>gateDemo(request,env as unknown as DemoEnv,ctx,clean=>handler.fetch(clean,env,ctx))));
  },
};
