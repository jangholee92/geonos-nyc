'use client';
import {useState} from 'react';
import {ChevronsLeftRight,MoveHorizontal} from 'lucide-react';
import GeoScene,{type SceneFeature} from './geo-scene';

/** Both layers use the identical projection, extent and source vertices. The
 * control changes only what is visible, never interpolates a climate outcome. */
export default function ScenarioWipe({current,future,bounds}:{current:SceneFeature[];future:SceneFeature[];bounds?:number[]}){
  const [split,setSplit]=useState(50);
  return <div className="scenario-wipe">
    <div className="scenario-wipe-canvas" aria-hidden="true">
      <GeoScene features={current} bounds={bounds} showCaption={false} caption="Current sea-level scenario" attribution="NYC DEP + OTI / source vertices"/>
      <div className="scenario-wipe-future" style={{clipPath:`inset(0 0 0 ${split}%)`}}><GeoScene features={future} bounds={bounds} showCaption={false} caption="2050 sea-level scenario" attribution="NYC DEP + OTI / source vertices"/></div>
      <div className="scenario-wipe-line" style={{left:split+'%'}}><span><ChevronsLeftRight size={22}/></span></div>
      {split>0&&<div className="scenario-wipe-label current">CURRENT SEA LEVELS</div>}{split<100&&<div className="scenario-wipe-label future">2050 · +30 IN</div>}
    </div>
    <label className="scenario-wipe-control"><span><MoveHorizontal size={17}/><b>Slide to compare the same ground</b><small>{split===0?'2050 scenario only':split===100?'Current scenario only':'Current on the left · 2050 on the right'}</small></span><input type="range" min="0" max="100" step="1" value={split} onChange={event=>setSplit(Number(event.target.value))} aria-label="Scenario comparison divider" aria-valuetext={`${split}% current-sea-level view; ${100-split}% 2050-sea-level view. This is a visual reveal, not a probability.`}/></label>
    <p className="scenario-wipe-caption">Same extent, same 2.13-inch rainfall input. The divider reveals two published scenarios; it does not interpolate a forecast. Read both scenarios’ numbers below.</p>
  </div>;
}
