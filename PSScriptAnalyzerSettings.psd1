@{
    # Interactive installer output is host UI by design (colored [Y/n] prompts and
    # status lines), so PSAvoidUsingWriteHost does not apply here.
    ExcludeRules = @('PSAvoidUsingWriteHost')
}
