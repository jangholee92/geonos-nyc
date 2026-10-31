import {fetchSiteContext} from '../../../lib/site-context';
export async function GET(request:Request){try{const id=new URL(request.url).searchParams.get('id')||'';return Response.json(await fetchSiteContext(id),{headers:{'Cache-Control':'private, max-age=600'}})}catch(e){return Response.json({error:e instanceof Error?e.message:'Site context could not be retrieved.'},{status:503})}}
