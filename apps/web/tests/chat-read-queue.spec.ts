import {describe,it,expect} from 'vitest';
import {ChatReadQueue} from '../src/chat-read-queue';

describe('chat mutation refresh during a delayed background read',()=>{
  it('waits for the old snapshot, then fetches the newly created conversation before selection',async()=>{
    const queue=new ChatReadQueue(),events:string[]=[],oldSnapshot:string[]=[];
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const background=queue.run(true,async()=>{await gate;events.push('old read complete');oldSnapshot.push('coordinator');});
    let snapshot:string[]=[],selected:string|undefined;
    const openDirect=async()=>{events.push('direct created');await queue.run(false,async()=>{events.push('fresh read');snapshot=[...oldSnapshot,'specialist direct'];});selected=snapshot.find(id=>id==='specialist direct');};
    const mutation=openDirect();await Promise.resolve();expect(selected).toBeUndefined();expect(events).toEqual(['direct created']);
    await queue.run(true,async()=>{throw new Error('background reads should coalesce');});
    release();await Promise.all([background,mutation]);expect(events).toEqual(['direct created','old read complete','fresh read']);expect(selected).toBe('specialist direct');
  });
  it('serializes multiple explicit refreshes and remains usable after a failed read',async()=>{
    const queue=new ChatReadQueue();let active=0,maxActive=0;
    await Promise.all([1,2,3].map(()=>queue.run(false,async()=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;})));expect(maxActive).toBe(1);
    await expect(queue.run(false,async()=>{throw new Error('read failed');})).rejects.toThrow('read failed');
    let refreshed=false;await queue.run(false,async()=>{refreshed=true;});expect(refreshed).toBe(true);
  });
});
