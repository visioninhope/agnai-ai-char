import { Component, Setter, Show, createEffect, createMemo, createSignal, on } from 'solid-js'
import Button from '/web/shared/Button'
import { HelpModal, RootModal } from '/web/shared/Modal'
import { JsonSchema } from '/web/shared/JsonSchema'
import TextInput from '/web/shared/TextInput'
import { FormLabel } from '/web/shared/FormLabel'
import { ResponseSchema } from '/common/types/library'
import { Card, Pill, TitleCard } from '/web/shared/Card'
import { JSON_NAME_RE, neat } from '/common/util'
import { JsonField } from '/common/prompt'
import { AutoComplete } from '/web/shared/AutoComplete'
import { characterStore, presetStore, toastStore } from '/web/store'
import { CircleHelp } from 'lucide-solid'
import { downloadJson, ExtractProps } from '/web/shared/util'
import FileInput, { getFileAsString } from '/web/shared/FileInput'
import { assertValid } from '/common/valid'

const helpMarkdown = neat`
You can return many values using JSON schemas and control the structure of your response.
For example you could define the following fields:
- **response**: string
- **character health percentage**: number

You can then reference these fields in your **response** and **history** templates:

Response Template
\`\`\`
{{response}}
\`HP: {{character health percentage}}%\`
\`\`\`

History Template
\`\`\`
{{response}}
(User's health: {{character health percentage}}%)
\`\`\`

**Tips**:
- Use instructive fields names. This tells the AI how to generate that field.
- If a field is disabled, it won't be included in the generation.
- Order may be important. For example, if you have a multi-character schema you may name the fields like this:
-- **Steve's message to Linda**
-- **Linda's response to Steve**
`

export const CharacterSchema: Component<{
  characterId?: string
  presetId?: string
  inherit?: ResponseSchema
  update: (next: ResponseSchema) => void
}> = (props) => {
  let respRef: HTMLTextAreaElement
  let histRef: HTMLTextAreaElement

  const [show, setShow] = createSignal(false)
  const [schema, setSchema] = createSignal<JsonField[]>(props.inherit?.schema || [])
  const [showImport, setShowImport] = createSignal(false)
  const [response, setResponse] = createSignal(props.inherit?.response || '')
  const [hist, setHistory] = createSignal(props.inherit?.history || '')
  const [candidate, setCandidate] = createSignal<JsonField[]>([])
  const [auto, setAuto] = createSignal('')
  const [hotkey, setHotkey] = createSignal(false)

  const vars = createMemo(() => {
    const sch = candidate()
    return sch.map((s) => ({ label: s.name, value: s.name }))
  })

  const [resErr, setResErr] = createSignal('')
  const [histErr, setHistErr] = createSignal('')

  createEffect(
    on(
      () => props.inherit,
      (next) => {
        if (next) {
          setSchema(next.schema || [])
          setHistory(next.history || '')
          setResponse(next.response || '')
        }
      }
    )
  )

  createEffect(() => {
    const resVars = response().match(JSON_NAME_RE())
    const histVars = hist().match(JSON_NAME_RE())

    const sch = candidate()
    const names = new Set(sch.map((s) => s.name))

    if (resVars) {
      const bad: string[] = []
      for (const res of resVars) {
        const name = res.slice(2, -2)
        if (!names.has(name)) {
          bad.push(name)
        }
      }
      setResErr(bad.length ? bad.join(', ') : '')
    }

    if (histVars) {
      const bad: string[] = []
      for (const res of histVars) {
        const name = res.slice(2, -2)
        if (!names.has(name)) {
          bad.push(name)
        }
      }
      setHistErr(bad.length ? bad.join(', ') : '')
    }
  })

  const onFieldNameChange = (from: string, to: string) => {
    const res = response().split(`{{${from}}}`).join(`{{${to}}}`)
    const his = hist().split(`{{${from}}}`).join(`{{${to}}}`)

    histRef.value = his
    respRef.value = res
    setResponse(res)
    setHistory(his)
  }

  const onAutoComplete = (setter: Setter<string>) => (opt: { label: string }) => {
    const ref = auto() === 'history' ? histRef : auto() === 'response' ? respRef : undefined

    if (ref) {
      let prev = ref.value
      let before = prev.slice(0, ref.selectionStart - (hotkey() ? 0 : 1))
      let after = prev.slice(ref.selectionStart)

      if (before.endsWith('{{')) {
        // Do nothing
      } else if (before.endsWith('{')) {
        before = before + '{'
      } else if (!before.endsWith('{')) {
        before = before + '{{'
      }

      if (!after.startsWith('}')) {
        after = '}}' + after
      }

      const next = `${before}${opt.label}${after}`
      ref.value = next
      setter(next)
      ref.focus()
      ref.setSelectionRange(
        before.length + opt.label.length,
        before.length + opt.label.length,
        'none'
      )
    }

    setHotkey(false)
    setAuto('')
  }

  const importSchema = (schema?: ResponseSchema) => {
    setShowImport(false)
    if (!schema) {
      return
    }

    setCandidate(schema.schema)
    setHistory(schema.history)
    setResponse(schema.response)

    close(true)
  }

  const close = (save?: boolean) => {
    if (save) {
      const update = {
        history: hist(),
        response: response(),
        schema: candidate(),
      }
      props.update(update)
      setSchema(candidate())

      if (props.characterId) {
        characterStore.editPartialCharacter(props.characterId, { json: update })
      }

      if (props.presetId) {
        presetStore.updatePreset(props.presetId, { json: update })
      }
    }

    setHistErr('')
    setResErr('')
    setShow(false)
  }

  const filename = createMemo(() =>
    props.characterId
      ? `schema-char-${props.characterId.slice(0, 4)}`
      : props.presetId
      ? `schema-preset-${props.presetId.slice(0, 4)}`
      : 'schema'
  )

  return (
    <div class="w-full justify-center">
      <FormLabel
        label={
          <div class="flex justify-between">
            <div>JSON Structured Responses</div>
            <div class="flex gap-1">
              <Button size="pill" schema="secondary" onClick={() => setShowImport(true)}>
                Import
              </Button>
              <Show when={props.inherit}>
                <Button
                  size="pill"
                  schema="secondary"
                  onClick={() => downloadJson(props.inherit!, filename())}
                >
                  Export
                </Button>
              </Show>
            </div>
          </div>
        }
        helperText="Request and structure responses using JSON. Only used if JSON schemas are available"
      />

      <div class="flex gap-2">
        <Button onClick={() => setShow(true)}>Update Schema</Button>
      </div>

      <RootModal
        show={show()}
        maxWidth="half"
        close={() => setShow(false)}
        footer={
          <>
            <Button schema="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button onClick={() => close(true)}>
              <Show when={props.characterId}>Save</Show>
              <Show when={!props.characterId}>Accept</Show>
            </Button>
          </>
        }
      >
        <div class="flex flex-col gap-2 text-sm">
          <div class="flex w-full justify-center gap-2">
            <Pill type="premium">
              This feature is in beta. Please raise bugs on Discord or GitHub.
            </Pill>

            <HelpModal
              title="Information"
              cta={
                <Button size="sm">
                  <CircleHelp size={24} />
                </Button>
              }
              markdown={helpMarkdown}
            />
          </div>
          <Card class="relative">
            <Show when={auto() === 'response'}>
              <AutoComplete
                options={vars()}
                close={() => setAuto('')}
                dir="down"
                onSelect={onAutoComplete(setResponse)}
              />
            </Show>
            <TextInput
              isMultiline
              ref={(r) => (respRef = r)}
              fieldName="jsonSchemaResponse"
              label="Response Template"
              onKeyDown={(ev) => {
                if (ev.key === '{') setAuto('response')
                if (ev.ctrlKey && ev.code === 'Space') {
                  setHotkey(true)
                  setAuto('response')
                }
              }}
              helperText={
                <>
                  <div>How the message appears in your chat</div>
                  <Show when={!!resErr()}>
                    <TitleCard type="rose">
                      Template references undefined placeholders: {resErr()}
                    </TitleCard>
                  </Show>
                </>
              }
              value={props.inherit?.response}
              onInputText={(ev) => setResponse(ev)}
              placeholder="Response Template"
              class="font-mono text-xs"
            />
          </Card>

          <Card class="relative">
            <Show when={auto() === 'history'}>
              <AutoComplete
                options={vars()}
                close={() => setAuto('')}
                dir="down"
                onSelect={onAutoComplete(setHistory)}
              />
            </Show>
            <TextInput
              class="font-mono text-xs"
              ref={(r) => (histRef = r)}
              label="History Template"
              onKeyDown={(ev) => {
                if (ev.key === '{') setAuto('history')
                if (ev.ctrlKey && ev.code === 'Space') {
                  setHotkey(true)
                  setAuto('history')
                }
              }}
              helperText={
                <>
                  <>
                    <div>How the message appears in a prompt</div>
                    <Show when={!!histErr()}>
                      <TitleCard type="rose">
                        Template references undefined placeholders: {histErr()}
                      </TitleCard>
                    </Show>
                  </>
                </>
              }
              isMultiline
              fieldName="jsonSchemaHistory"
              value={props.inherit?.history}
              onInputText={(ev) => setHistory(ev)}
              placeholder="History Template"
            />
          </Card>

          <JsonSchema
            inherit={schema()}
            update={(ev) => setCandidate(ev)}
            onNameChange={onFieldNameChange}
          />
        </div>
      </RootModal>

      <ImportModal show={showImport()} close={importSchema} />
    </div>
  )
}

const ImportModal: Component<{ show: boolean; close: (schema?: ResponseSchema) => void }> = (
  props
) => {
  const onUpdate: ExtractProps<typeof FileInput>['onUpdate'] = async (files) => {
    const file = files[0]
    if (!file) return

    try {
      const content = await getFileAsString(file)
      const json = JSON.parse(content)

      assertValid({ response: 'string', history: 'string', schema: ['any'] }, json)

      for (const field of json.schema) {
        assertValid({ type: { type: 'string' }, name: 'string' }, field)
      }

      props.close(json)
    } catch (ex: any) {
      toastStore.error(`Invalid JSON Schema: ${ex.message}`)
    }
  }

  return (
    <RootModal
      show={props.show}
      close={props.close}
      footer={
        <>
          <Button schema="secondary" onClick={() => props.close()}>
            Close
          </Button>
        </>
      }
    >
      <FileInput
        fieldName="import-schema"
        accept="text/json,application/json"
        label="JSON Schema File (.json)"
        onUpdate={onUpdate}
      />
    </RootModal>
  )
}
