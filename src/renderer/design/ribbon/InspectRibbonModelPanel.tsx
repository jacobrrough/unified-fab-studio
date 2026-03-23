import type { ReactNode } from 'react'
import {
  IconDim,
  IconMeasure,
  IconParams,
  IconSection
} from './designRibbonIcons'
import { RibbonFusionGroup, RibbonIconButton } from './RibbonPrimitives'

export type InspectRibbonModelPanelProps = {
  viewportGeometry: unknown | null
  measureMode: boolean
  sectionEnabled: boolean
  linearDimStep: 'off' | 'a' | 'b'
  onEnsureModelPhase: () => void
  onMeasureActivate: () => void
  onSectionActivate: () => void
  onStartLinearDimension: () => void
  onOpenParametersInConstraintTab: () => void
}

/**
 * Inspect ribbon when **model** phase is active — measure, section, quick links to dims/params.
 */
export function InspectRibbonModelPanel({
  viewportGeometry,
  measureMode,
  sectionEnabled,
  linearDimStep,
  onEnsureModelPhase,
  onMeasureActivate,
  onSectionActivate,
  onStartLinearDimension,
  onOpenParametersInConstraintTab
}: InspectRibbonModelPanelProps): ReactNode {
  return (
    <div className="ribbon-toolbar-strip">
      <RibbonFusionGroup label="Inspect">
        <div className="ribbon-row ribbon-row--fusion">
          <RibbonIconButton
            icon={<IconMeasure />}
            label="Measure"
            title="Shift+click two points on the 3D solid"
            active={measureMode}
            disabled={!viewportGeometry}
            commandId="ut_measure"
            onClick={() => {
              onEnsureModelPhase()
              onMeasureActivate()
            }}
          />
          <RibbonIconButton
            icon={<IconSection />}
            label="Section"
            title="Clip 3D preview at Y plane"
            active={sectionEnabled}
            disabled={!viewportGeometry}
            commandId="ut_section"
            onClick={() => {
              onEnsureModelPhase()
              onSectionActivate()
            }}
          />
          <RibbonIconButton
            icon={<IconDim />}
            label="Linear dim"
            title="Pick two sketch points for annotation dimension"
            active={linearDimStep !== 'off'}
            commandId="dim_linear"
            onClick={onStartLinearDimension}
          />
          <RibbonIconButton
            icon={<IconParams />}
            label="Params"
            title="Scroll to named parameters"
            commandId="ut_parameters"
            onClick={onOpenParametersInConstraintTab}
          />
        </div>
      </RibbonFusionGroup>
    </div>
  )
}
