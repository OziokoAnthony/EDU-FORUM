import { notFound } from 'next/navigation';
import { isWizardStep } from '../wizard-steps';
import { Wizard } from '../wizard';

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!isWizardStep(step)) notFound();
  return <Wizard step={step} />;
}
