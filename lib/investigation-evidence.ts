import type {CityBuilding} from './city';
import type {EnergyReport} from './energy-evidence';
import type {SurroundingsEvidence} from './surroundings';

export type EvidenceStatus='available'|'loading'|'not_requested'|'unavailable'|'not_linked';
export type EvidenceCapture<T>={status:EvidenceStatus;captured_at?:string;data:T|null;note:string};
export type EnergyCaptureData={bbl:string|null;calendar_year:number|null;records:EnergyReport[];asset:string|null;source_url:string;reporting_scope_source:Record<string,unknown>|null};
export type WeatherCaptureData={station_id:string;name:string;distance_m:number;outside_nyc_reference:boolean;latitude:number;longitude:number;periods:{label:string;start_year:number;end_year:number;tmean_c:number|null}[];source_url:string;source_sha256:string|null;source_retrieved_on:string|null;source_snapshot:Record<string,unknown>|null;methodology:Record<string,unknown>|null};
export type FacilityCapture={category:string;id:string|number|null;label:string;distance_m:number;geometry:unknown;properties:Record<string,unknown>;source_url:string|null};
export type InfrastructureCaptureData={facilities:FacilityCapture[];coverage:{category:string;status:EvidenceStatus;source_metadata:Record<string,unknown>|null}[];method:string};
export type LoadedPlaceEvidence={
 identity:{id:string;bbl:string|null;footprint_edited_at:string|null};
 energy?:EvidenceCapture<EnergyCaptureData>;
 weather?:EvidenceCapture<WeatherCaptureData>;
 infrastructure?:EvidenceCapture<InfrastructureCaptureData>;
 surroundings?:EvidenceCapture<SurroundingsEvidence>;
};
export type PlaceEvidenceRegistry=Record<string,LoadedPlaceEvidence>;
export const evidenceIdentity=(building:CityBuilding)=>({id:building.id,bbl:building.bbl,footprint_edited_at:building.footprint_edited_at});
const sameIdentity=(entry:LoadedPlaceEvidence|undefined,building:CityBuilding)=>!!entry&&entry.identity.id===building.id&&entry.identity.bbl===building.bbl&&entry.identity.footprint_edited_at===building.footprint_edited_at;
/** Merge only the named record and preserve concurrently completed evidence. No
 * captured data is fed into operational conditions or the decision evaluator. */
export function retainPlaceEvidence(previous:PlaceEvidenceRegistry,building:CityBuilding,patch:Partial<Omit<LoadedPlaceEvidence,'identity'>>):PlaceEvidenceRegistry{
 const existing=sameIdentity(previous[building.id],building)?previous[building.id]:{identity:evidenceIdentity(building)};
 return{...previous,[building.id]:{...existing,...patch,identity:evidenceIdentity(building)}};
}
export function selectedPlaceEvidence(registry:PlaceEvidenceRegistry,buildings:CityBuilding[]):PlaceEvidenceRegistry{
 return Object.fromEntries(buildings.map(building=>[building.id,sameIdentity(registry[building.id],building)?registry[building.id]:{identity:evidenceIdentity(building)}]));
}
export const notRequested=<T>():EvidenceCapture<T>=>({status:'not_requested',data:null,note:'This evidence was not requested in this investigation.'});
export function captureSurroundings(data:SurroundingsEvidence):EvidenceCapture<SurroundingsEvidence>{return{status:data.status==='available'?'available':'unavailable',captured_at:new Date().toISOString(),data,note:data.status==='available'?'Published surrounding-ground geometry matched to this source outline. No indoor flooding or safety conclusion.':data.reason};}
export function captureWeather(nearest:any,climate:any,status:EvidenceStatus):EvidenceCapture<WeatherCaptureData>{
 const note='Nearest station among the four reference stations included in this snapshot. Straight-line distance; derived historical station statistics, not building weather or official NOAA Climate Normals. No Climate Studio selections are implied.';
 if(!nearest)return{status,data:null,note,captured_at:new Date().toISOString()};
 const mean=(key:string)=>{const value=nearest.summary?.[key]?.annual_average?.tmean_c;return typeof value==='number'&&Number.isFinite(value)?value:null;};
 return{status:'available',captured_at:new Date().toISOString(),note,data:{station_id:nearest.id,name:nearest.name,distance_m:nearest.distance,outside_nyc_reference:!!nearest.outside_nyc_reference,latitude:nearest.latitude,longitude:nearest.longitude,periods:[{label:'Derived baseline',start_year:1991,end_year:2020,tmean_c:mean('baseline_1991_2020')},{label:'Recent context',start_year:2021,end_year:2025,tmean_c:mean('recent_2021_2025')}],source_url:nearest.source_url,source_sha256:nearest.source_sha256||null,source_retrieved_on:nearest.source_retrieved_on||null,source_snapshot:climate?.source_snapshot||null,methodology:climate?.methodology||null}};
}
export function captureInfrastructure(nearby:any[],assets:Record<string,any>,catalog:any[],failedAssets:string[],eligible:boolean):EvidenceCapture<InfrastructureCaptureData>{
 const categories=['subway_stations','firehouses','hospitals'];
 const coverage=categories.map(category=>({category,status:!eligible?'unavailable':failedAssets.includes('/data/layers/'+category+'.geojson')?'unavailable':!assets[category]?'loading':nearby.some(feature=>feature.category===category)?'available':'not_linked',source_metadata:catalog.find(source=>source.id===category||source.asset==='/data/layers/'+category+'.geojson')||null})) as InfrastructureCaptureData['coverage'];
 const facilities=nearby.filter(feature=>categories.includes(feature.category)).slice(0,3).map(feature=>({category:feature.category,id:feature.properties?.id??feature.id??null,label:String(feature.properties?.label||'Unnamed source feature'),distance_m:feature.distance,geometry:feature.geometry,properties:feature.properties||{},source_url:feature.properties?.source||null}));
 return{status:facilities.length?'available':coverage.some(item=>item.status==='loading')?'loading':coverage.some(item=>item.status==='unavailable')?'unavailable':'not_linked',captured_at:new Date().toISOString(),note:'Nearest source-covered feature in each loaded category. Coverage status is retained separately for every category.',data:{facilities,coverage,method:'Straight-line distance from the supplied reference point; no travel time, entrance location, emergency availability or service quality is inferred. Hospital coverage is the classified hospital/off-campus emergency subset.'}};
}
