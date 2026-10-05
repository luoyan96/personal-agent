import { routes } from '@research-agent-platform/contracts';
import { validationMessage } from './api-errors';

/** Validate the trimmed account/code, while keeping the exact password. */
export function bindAuthInputValidation(form: HTMLFormElement) {
  const schemas = routes.register.request.shape.body.shape;
  for (const name of ['username','password','inviteCode'] as const) {
    const input=form.querySelector<HTMLInputElement>(`[name=${name}]`);
    if(!input)continue;
    const error=document.createElement('p');
    error.className='fine';error.setAttribute('role','alert');error.hidden=true;
    input.closest('label')?.after(error);
    const validate=(show=false)=>{
      const parsed=schemas[name].safeParse(name==='password'?input.value:input.value.trim());
      const message=parsed.success?'':validationMessage([{path:[name]}]);
      input.setCustomValidity(message);error.textContent=message;error.hidden=!show||!message;
    };
    input.addEventListener('input',()=>validate(true));
    input.addEventListener('change',()=>validate(true));
    input.addEventListener('invalid',()=>validate(true));
    validate();
  }
}
