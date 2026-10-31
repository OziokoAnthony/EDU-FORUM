import { notFound } from 'next/navigation';
import { SchoolWizard } from '../wizard';
import { isSchoolStep } from '../wizard-steps';

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!isSchoolStep(step)) notFound();
  return <SchoolWizard step={step} />;
}
