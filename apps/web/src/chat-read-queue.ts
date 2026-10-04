/** Background reads may coalesce. An explicit read must wait for any older
 * read and then fetch again, so a mutation never selects from a stale snapshot. */
export class ChatReadQueue {
  private active?:Promise<void>;
  async run(background:boolean,read:()=>Promise<void>):Promise<void> {
    while(this.active){if(background)return;await this.active;}
    const pending=read();this.active=pending;
    try{await pending;}finally{if(this.active===pending)this.active=undefined;}
  }
}
